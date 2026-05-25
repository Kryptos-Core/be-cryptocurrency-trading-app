package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/segmentio/kafka-go"
)

type Config struct {
	ServiceName      string
	Env              string
	HTTPAddr         string
	ShadowMode       bool
	ReadOnlyMode     bool
	MutationsEnabled bool
	KafkaBrokers     string
	KafkaGroup       string
	KafkaTopics      []string
	RedisAddr        string
	PostgresHost     string
	BuildVersion     string
	BuildCommit      string
}

type Server struct {
	cfg           Config
	logger        *slog.Logger
	started       time.Time
	consumed      uint64
	logged        uint64
	errors        uint64
	lastKafkaUnix atomic.Int64
}

func LoadConfig(defaultServiceName, defaultPort string) Config {
	return Config{
		ServiceName:      getenv("SERVICE_NAME", defaultServiceName),
		Env:              getenv("SERVICE_ENV", getenv("NODE_ENV", "production")),
		HTTPAddr:         getenv("HTTP_ADDR", ":"+defaultPort),
		ShadowMode:       getenvBool("SHADOW_MODE", true),
		ReadOnlyMode:     getenvBool("READ_ONLY_MODE", true),
		MutationsEnabled: getenvBool("MUTATIONS_ENABLED", false),
		KafkaBrokers:     getenv("KAFKA_BROKERS", "kafka:9092"),
		KafkaGroup:       getenv("KAFKA_GROUP", defaultServiceName+"-prod-v1"),
		KafkaTopics:      splitCSV(getenv("KAFKA_TOPICS", defaultTopics(defaultServiceName))),
		RedisAddr:        getenv("REDIS_ADDR", "redis:6379"),
		PostgresHost:     getenv("POSTGRES_HOST", "postgres"),
		BuildVersion:     getenv("BUILD_VERSION", "dev"),
		BuildCommit:      getenv("BUILD_COMMIT", "unknown"),
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

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.healthz)
	mux.HandleFunc("/readyz", s.readyz)
	mux.HandleFunc("/metrics", s.metrics)
	mux.HandleFunc("/", s.index)

	srv := &http.Server{Addr: s.cfg.HTTPAddr, Handler: s.logRequests(mux), ReadHeaderTimeout: 5 * time.Second}

	stop, cancel := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	for _, topic := range s.cfg.KafkaTopics {
		go s.consumeKafka(stop, topic)
	}

	errCh := make(chan error, 1)
	go func() {
		s.logger.Info("service.starting", "service", s.cfg.ServiceName, "addr", s.cfg.HTTPAddr, "shadow_mode", s.cfg.ShadowMode, "read_only_mode", s.cfg.ReadOnlyMode, "mutations_enabled", s.cfg.MutationsEnabled, "kafka_topics", strings.Join(s.cfg.KafkaTopics, ","))
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-stop.Done():
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		s.logger.Info("service.shutdown")
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func (s *Server) consumeKafka(ctx context.Context, topic string) {
	if topic == "" {
		return
	}
	reader := kafka.NewReader(kafka.ReaderConfig{Brokers: splitCSV(s.cfg.KafkaBrokers), Topic: topic, GroupID: s.cfg.KafkaGroup})
	defer reader.Close()
	s.logger.Info("kafka.consumer.starting", "service", s.cfg.ServiceName, "topic", topic, "group", s.cfg.KafkaGroup)
	for {
		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			atomic.AddUint64(&s.errors, 1)
			s.logger.Warn("kafka.consumer.error", "topic", topic, "error", err.Error())
			time.Sleep(time.Second)
			continue
		}
		count := atomic.AddUint64(&s.consumed, 1)
		s.lastKafkaUnix.Store(time.Now().Unix())
		if count <= 20 || count%1000 == 0 {
			atomic.AddUint64(&s.logged, 1)
			s.logger.Info("kafka.message.consumed", "topic", msg.Topic, "partition", msg.Partition, "offset", msg.Offset, "key", string(msg.Key), "bytes", len(msg.Value), "count", count, "shadow_mode", s.cfg.ShadowMode, "read_only_mode", s.cfg.ReadOnlyMode, "mutations_enabled", s.cfg.MutationsEnabled)
		}
	}
}

func (s *Server) index(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"service": s.cfg.ServiceName, "status": "ok", "mode": s.mode()})
}

func (s *Server) healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": s.cfg.ServiceName, "uptime_seconds": int(time.Since(s.started).Seconds())})
}

func (s *Server) readyz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ready", "service": s.cfg.ServiceName, "kafka_brokers": s.cfg.KafkaBrokers, "kafka_topics": s.cfg.KafkaTopics, "redis_addr": s.cfg.RedisAddr, "postgres_host": s.cfg.PostgresHost})
}

func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	uptime := int(time.Since(s.started).Seconds())
	fmt.Fprintf(w, "# HELP go_service_up Service liveness.\n# TYPE go_service_up gauge\ngo_service_up{service=%q,env=%q} 1\n", s.cfg.ServiceName, s.cfg.Env)
	fmt.Fprintf(w, "# HELP go_service_uptime_seconds Service uptime in seconds.\n# TYPE go_service_uptime_seconds gauge\ngo_service_uptime_seconds{service=%q} %d\n", s.cfg.ServiceName, uptime)
	fmt.Fprintf(w, "# HELP go_service_mode_info Service safety mode flags.\n# TYPE go_service_mode_info gauge\ngo_service_mode_info{service=%q,shadow_mode=%q,read_only_mode=%q,mutations_enabled=%q} 1\n", s.cfg.ServiceName, strconv.FormatBool(s.cfg.ShadowMode), strconv.FormatBool(s.cfg.ReadOnlyMode), strconv.FormatBool(s.cfg.MutationsEnabled))
	fmt.Fprintf(w, "# HELP go_service_build_info Build metadata.\n# TYPE go_service_build_info gauge\ngo_service_build_info{service=%q,version=%q,commit=%q} 1\n", s.cfg.ServiceName, s.cfg.BuildVersion, s.cfg.BuildCommit)
	fmt.Fprintf(w, "# HELP go_service_kafka_messages_total Kafka messages consumed.\n# TYPE go_service_kafka_messages_total counter\ngo_service_kafka_messages_total{service=%q} %d\n", s.cfg.ServiceName, atomic.LoadUint64(&s.consumed))
	fmt.Fprintf(w, "# HELP go_service_kafka_errors_total Kafka consumer errors.\n# TYPE go_service_kafka_errors_total counter\ngo_service_kafka_errors_total{service=%q} %d\n", s.cfg.ServiceName, atomic.LoadUint64(&s.errors))
	fmt.Fprintf(w, "# HELP go_service_last_kafka_message_timestamp_seconds Last Kafka message time.\n# TYPE go_service_last_kafka_message_timestamp_seconds gauge\ngo_service_last_kafka_message_timestamp_seconds{service=%q} %d\n", s.cfg.ServiceName, s.lastKafkaUnix.Load())
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
		next.ServeHTTP(w, r)
		s.logger.Info("http.request", "method", r.Method, "path", r.URL.Path, "remote", r.RemoteAddr, "duration_ms", time.Since(started).Milliseconds())
	})
}

func (s *Server) mode() string {
	if s.cfg.ShadowMode {
		return "shadow"
	}
	if s.cfg.ReadOnlyMode {
		return "read_only"
	}
	return "active"
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

func defaultTopics(service string) string {
	switch service {
	case "matching-engine":
		return "crypto-trading.orderplaced,crypto-trading.ordercancelled,crypto-trading.tradeexecuted"
	default:
		return "crypto-trading.tradeexecuted,crypto-trading.market.ticker,market.ticker"
	}
}

func BuildInfo() (string, string) {
	if info, ok := debug.ReadBuildInfo(); ok {
		return info.Main.Version, "unknown"
	}
	return "dev", "unknown"
}
