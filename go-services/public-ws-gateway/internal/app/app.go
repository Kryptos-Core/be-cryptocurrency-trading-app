package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"

	"github.com/kryptos/go-services/metrics"
	"github.com/kryptos/go-services/public-ws-gateway/internal/adapter/socketio"
	"github.com/kryptos/go-services/public-ws-gateway/internal/infrastructure/ticker"
)

type Config struct {
	ServiceName   string
	Env           string
	HTTPAddr      string
	KafkaBrokers  string
	KafkaGroup    string
	KafkaTopics   []string
	RedisAddr     string
	BuildVersion  string
	BuildCommit   string
	TickerChannel string
}

type Server struct {
	cfg           Config
	logger        *slog.Logger
	started       time.Time
	redisClient   *redis.Client
	socketIOServer *socketio.Server
	tickerSub     *ticker.RedisSubscriber
	metricsMu     sync.RWMutex
	connections   int64
	messagesSent  int64
	authFailures  int64
}

func LoadConfig(defaultServiceName, defaultPort string) Config {
	return Config{
		ServiceName:   getenv("SERVICE_NAME", defaultServiceName),
		Env:           getenv("SERVICE_ENV", getenv("NODE_ENV", "production")),
		HTTPAddr:      getenv("HTTP_ADDR", ":"+defaultPort),
		KafkaBrokers:  getenv("KAFKA_BROKERS", "kafka:9092"),
		KafkaGroup:    getenv("KAFKA_GROUP", defaultServiceName+"-prod-v1"),
		KafkaTopics:   splitCSV(getenv("KAFKA_TOPICS", "crypto-trading.market.ticker,market.ticker")),
		RedisAddr:     getenv("REDIS_ADDR", "redis:6379"),
		BuildVersion:  getenv("BUILD_VERSION", "dev"),
		BuildCommit:  getenv("BUILD_COMMIT", "unknown"),
		TickerChannel: getenv("TICKER_CHANNEL", "trading:external:ticker"),
	}
}

func New(cfg Config) *Server {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	return &Server{cfg: cfg, logger: logger, started: time.Now().UTC()}
}

func (s *Server) Run(ctx context.Context) error {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		return s.healthcheckCommand(ctx)
	}

	metrics.ServiceUp.WithLabelValues(s.cfg.ServiceName, s.cfg.Env).Set(1)
	metrics.ServiceUptimeSeconds.WithLabelValues(s.cfg.ServiceName).Set(0)
	metrics.ServiceBuildInfo.WithLabelValues(s.cfg.ServiceName, s.cfg.BuildVersion, s.cfg.BuildCommit).Set(1)

	go s.updateMetrics()

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	s.logger.Info("ws.server.starting",
		"service", s.cfg.ServiceName,
		"addr", s.cfg.HTTPAddr,
		"redis_addr", s.cfg.RedisAddr,
		"kafka_brokers", s.cfg.KafkaBrokers,
		"kafka_topics", strings.Join(s.cfg.KafkaTopics, ","),
	)

	s.redisClient = redis.NewClient(&redis.Options{Addr: s.cfg.RedisAddr, PoolSize: 10})
	if err := s.redisClient.Ping(ctx).Err(); err != nil {
		s.logger.Warn("redis.ping.failed", "error", err.Error())
	} else {
		s.logger.Info("redis.connected", "addr", s.cfg.RedisAddr)
	}

	tickerHandler := socketio.NewTickerHandler(s.logger)
	s.tickerSub = ticker.NewRedisSubscriber(s.redisClient, s.cfg.TickerChannel, tickerHandler, s.logger)
	if err := s.tickerSub.Start(ctx); err != nil {
		s.logger.Warn("ticker.subscriber.start.failed", "error", err.Error())
	}

	s.socketIOServer = socketio.NewServer(s.logger, s.cfg.ServiceName, s.cfg.Env)
	go func() {
		if err := s.socketIOServer.Run(ctx, s.cfg.HTTPAddr); err != nil {
			s.logger.Error("socketio.server.error", "error", err.Error())
		}
	}()

	go s.consumeKafka(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.healthz)
	mux.HandleFunc("/readyz", s.readyz)
	mux.Handle("/metrics", promhttp.Handler())
	mux.Handle("/", s.index)

	srv := &http.Server{Addr: s.cfg.HTTPAddr, Handler: s.logRequests(mux), ReadHeaderTimeout: 5 * time.Second}

	stop, stopCancel := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stopCancel()

	errCh := make(chan error, 1)
	go func() {
		addr := ":" + strconv.Itoa(portFromAddr(s.cfg.HTTPAddr)+1)
		srv.Addr = addr
		s.logger.Info("http.server.starting", "addr", addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-stop.Done():
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		s.logger.Info("service.shutdown")
		cancel()
		if s.tickerSub != nil {
			s.tickerSub.Stop()
		}
		if s.socketIOServer != nil {
			s.socketIOServer.Shutdown()
		}
		s.closeRedisClient()
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		s.closeRedisClient()
		if err != nil && err != http.ErrServerClosed {
			return err
		}
		return nil
	}
}

func (s *Server) closeRedisClient() {
	if s.redisClient != nil {
		s.logger.Info("redis.client.closing")
		s.redisClient.Close()
		s.redisClient = nil
	}
}

func (s *Server) updateMetrics() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		metrics.ServiceUptimeSeconds.WithLabelValues(s.cfg.ServiceName).Set(time.Since(s.started).Seconds())
		s.metricsMu.RLock()
		conns := s.connections
		msgs := s.messagesSent
		authFails := s.authFailures
		s.metricsMu.RUnlock()
		metrics.WSConnectionsCurrent.WithLabelValues(s.cfg.ServiceName, "/trading").Set(float64(conns))
		metrics.WSMessagesSentTotal.WithLabelValues(s.cfg.ServiceName, "ticker").Add(0)
		_ = msgs
		_ = authFails
	}
}

func (s *Server) consumeKafka(ctx context.Context) {
	for _, topic := range s.cfg.KafkaTopics {
		go func(t string) {
			reader := kafka.NewReader(kafka.ReaderConfig{
				Brokers:  splitCSV(s.cfg.KafkaBrokers),
				Topic:    t,
				GroupID:  s.cfg.KafkaGroup,
				MinBytes: 1,
				MaxBytes: 10e6,
			})
			defer reader.Close()
			s.logger.Info("kafka.consumer.starting", "topic", t)
			for {
				select {
				case <-ctx.Done():
					return
				default:
					msg, err := reader.ReadMessage(ctx)
					if err != nil {
						if ctx.Err() != nil {
							return
						}
						s.logger.Warn("kafka.read.error", "topic", t, "error", err.Error())
						time.Sleep(time.Second)
						continue
					}
					metrics.KafkaMessagesConsumed.WithLabelValues(s.cfg.ServiceName, t).Inc()
					s.handleKafkaMessage(msg)
				}
			}
		}(topic)
	}
}

func (s *Server) handleKafkaMessage(msg kafka.Message) {
	metrics.KafkaMessagesConsumed.WithLabelValues(s.cfg.ServiceName, msg.Topic).Inc()
}

func (s *Server) index(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"service": s.cfg.ServiceName,
		"status":  "ok",
		"env":     s.cfg.Env,
	})
}

func (s *Server) healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":        "ok",
		"service":       s.cfg.ServiceName,
		"uptime_seconds": int(time.Since(s.started).Seconds()),
	})
}

func (s *Server) readyz(w http.ResponseWriter, r *http.Request) {
	redisStatus := "not_configured"
	if s.redisClient != nil {
		if err := s.redisClient.Ping(r.Context()).Err(); err != nil {
			redisStatus = "unhealthy"
		} else {
			redisStatus = "healthy"
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":        "ready",
		"service":       s.cfg.ServiceName,
		"redis_addr":    s.cfg.RedisAddr,
		"redis_status":  redisStatus,
		"kafka_brokers": s.cfg.KafkaBrokers,
	})
}

func (s *Server) healthcheckCommand(ctx context.Context) error {
	url := "http://127.0.0.1" + s.cfg.HTTPAddr + "/healthz"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("healthcheck status=%d", resp.StatusCode)
	}
	return nil
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		metrics.HTTPRequestsInFlight.Inc()
		defer metrics.HTTPRequestsInFlight.Dec()
		next.ServeHTTP(w, r)
		duration := time.Since(started).Seconds()
		metrics.HTTPRequestsTotal.WithLabelValues(r.Method, r.URL.Path, "0").Inc()
		metrics.HTTPRequestDuration.WithLabelValues(r.Method, r.URL.Path).Observe(duration)
		s.logger.Debug("http.request", "method", r.Method, "path", r.URL.Path, "duration_ms", time.Since(started).Milliseconds())
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getenvBool(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func portFromAddr(addr string) int {
	if addr == "" {
		return 8080
	}
	portStr := addr
	if strings.HasPrefix(portStr, ":") {
		portStr = portStr[1:]
	}
	if p, err := strconv.Atoi(portStr); err == nil {
		return p
	}
	return 8080
}

func BuildInfo() (string, string) {
	if info, ok := debug.ReadBuildInfo(); ok {
		return info.Main.Version, "unknown"
	}
	return "dev", "unknown"
}
