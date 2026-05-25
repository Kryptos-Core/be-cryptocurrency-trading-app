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

	"github.com/redis/go-redis/v9"
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
	redisClient   *redis.Client
	published     uint64
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
	srv := &Server{cfg: cfg, logger: logger, started: time.Now().UTC()}
	srv.redisClient = redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, Password: getenv("REDIS_PASSWORD", "")})
	return srv
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
		if err := s.handleKafkaMessage(ctx, msg); err != nil {
			atomic.AddUint64(&s.errors, 1)
			s.logger.Warn("kafka.message.handle_error", "topic", msg.Topic, "offset", msg.Offset, "error", err.Error())
		}
		if count <= 20 || count%1000 == 0 {
			atomic.AddUint64(&s.logged, 1)
			s.logger.Info("kafka.message.consumed", "topic", msg.Topic, "partition", msg.Partition, "offset", msg.Offset, "key", string(msg.Key), "bytes", len(msg.Value), "count", count, "shadow_mode", s.cfg.ShadowMode, "read_only_mode", s.cfg.ReadOnlyMode, "mutations_enabled", s.cfg.MutationsEnabled)
		}
	}
}

type tickerEnvelope struct {
	EventType string `json:"eventType"`
	Payload   any    `json:"payload"`
}

type tickerOuterPayload struct {
	Payload tickerPayload `json:"payload"`
}

type tickerPayload struct {
	PairID             string `json:"pairId"`
	Symbol             string `json:"symbol"`
	LastPrice          string `json:"lastPrice"`
	Bid                string `json:"bid"`
	Ask                string `json:"ask"`
	Volume24h          string `json:"volume24h"`
	Volume24hUsd       string `json:"volume24hUsd"`
	Change24h          string `json:"change24h"`
	ChangePercent24h   string `json:"changePercent24h"`
	High24h            string `json:"high24h"`
	Low24h             string `json:"low24h"`
	Open24h            string `json:"open24h"`
	Timestamp          string `json:"timestamp"`
}

func (s *Server) handleKafkaMessage(ctx context.Context, msg kafka.Message) error {
	if s.cfg.ServiceName != "market-aggregator" || !strings.Contains(msg.Topic, "ticker") {
		return nil
	}
	var outer struct {
		EventType string             `json:"eventType"`
		Payload   tickerOuterPayload `json:"payload"`
	}
	if err := json.Unmarshal(msg.Value, &outer); err != nil {
		return err
	}
	if outer.Payload.Payload.PairID == "" {
		return nil
	}
	t := outer.Payload.Payload
	if !s.isFreshTicker(t.Timestamp) {
		return nil
	}
	compat := map[string]any{
		"pair_id": t.PairID,
		"symbol": t.Symbol,
		"last_price": t.LastPrice,
		"bid": t.Bid,
		"ask": t.Ask,
		"volume_24h": t.Volume24h,
		"volume_24h_usd": t.Volume24hUsd,
		"change_24h": t.Change24h,
		"change_percent_24h": t.ChangePercent24h,
		"high_24h": t.High24h,
		"low_24h": t.Low24h,
		"open_24h": t.Open24h,
		"timestamp": t.Timestamp,
	}
	encoded, err := json.Marshal(compat)
	if err != nil {
		return err
	}
	pipe := s.redisClient.Pipeline()
	pipe.Set(ctx, "shadow:go:market:ticker:"+t.PairID, encoded, 10*time.Minute)
	pipe.Publish(ctx, getenv("GO_AGGREGATOR_TICKER_CHANNEL", "trading:external:ticker"), encoded)
	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}
	atomic.AddUint64(&s.published, 1)
	return nil
}

func (s *Server) isFreshTicker(raw string) bool {
	if raw == "" {
		return false
	}
	parsed, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return false
	}
	maxAge := time.Duration(getenvInt("MARKET_AGGREGATOR_MAX_TICKER_AGE_SECONDS", 30)) * time.Second
	if maxAge <= 0 {
		maxAge = 30 * time.Second
	}
	return time.Since(parsed) <= maxAge && time.Until(parsed) <= 5*time.Second
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
	fmt.Fprintf(w, "# HELP go_service_redis_published_total Redis messages published.\n# TYPE go_service_redis_published_total counter\ngo_service_redis_published_total{service=%q} %d\n", s.cfg.ServiceName, atomic.LoadUint64(&s.published))
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


func getenvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
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
