package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"

	"github.com/kryptos/go-services/metrics"
)

const (
	KafkaStartGracePeriodSec = 30
	KafkaReconnectMaxSec     = 60
	KafkaReconnectJitter     = 0.3
)

// TickerCacheEntry represents a cached ticker with timestamp for TTL eviction.
type TickerCacheEntry struct {
	Data      string
	CachedAt  time.Time
}

const (
	// TickerCacheTTL is the default TTL for ticker cache entries.
	TickerCacheTTL = 5 * time.Minute
	// TickerCacheEvictionInterval is how often to run TTL eviction.
	TickerCacheEvictionInterval = 1 * time.Minute
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
	cfg      Config
	logger   *slog.Logger
	started  time.Time
	consumed uint64
	logged   uint64
	errors   uint64
	lastKafkaUnix    atomic.Int64
	redisClient      *redis.Client
	published        uint64

	tickerCache sync.Map

	// Eviction tracking
	lastEvictionUnix atomic.Int64
	evictedCount atomic.Int64

	draining atomic.Bool

	kafkaReconnects atomic.Uint64

	redisPublishLatencyMs atomic.Int64

	staleTickerCount atomic.Int64

	// Kafka lag tracking
	kafkaLag atomic.Int64
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

	// Initialize metrics
	metrics.ServiceUp.WithLabelValues(s.cfg.ServiceName, s.cfg.Env).Set(1)
	metrics.ServiceUptimeSeconds.WithLabelValues(s.cfg.ServiceName).Set(0)
	metrics.ServiceBuildInfo.WithLabelValues(s.cfg.ServiceName, s.cfg.BuildVersion, s.cfg.BuildCommit).Set(1)
	metrics.ServiceModeInfo.WithLabelValues(
		s.cfg.ServiceName,
		strconv.FormatBool(s.cfg.ShadowMode),
		strconv.FormatBool(s.cfg.ReadOnlyMode),
		strconv.FormatBool(s.cfg.MutationsEnabled),
	).Set(1)

	// Start uptime ticker
	go s.updateUptime()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.healthz)
	mux.HandleFunc("/readyz", s.readyz)
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/", s.index)

	srv := &http.Server{Addr: s.cfg.HTTPAddr, Handler: s.logRequests(mux), ReadHeaderTimeout: 5 * time.Second}

	stop, cancel := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	s.backfillFromRedisCache(stop)

	// Start TTL eviction for ticker cache
	go s.runTickerCacheEviction(stop)

	for _, topic := range s.cfg.KafkaTopics {
		go s.consumeKafka(stop, topic)
	}

	errCh := make(chan error, 1)
	go func() {
		s.logger.Info("service.starting",
			"service", s.cfg.ServiceName, "addr", s.cfg.HTTPAddr,
			"shadow_mode", s.cfg.ShadowMode, "read_only_mode", s.cfg.ReadOnlyMode,
			"mutations_enabled", s.cfg.MutationsEnabled,
			"kafka_topics", strings.Join(s.cfg.KafkaTopics, ","))
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-stop.Done():
		s.draining.Store(true)
		s.logger.Info("service.draining")
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

func (s *Server) backfillFromRedisCache(ctx context.Context) {
	channel := getenv("GO_AGGREGATOR_TICKER_CHANNEL", "trading:external:ticker")
	var count int

	iter := s.redisClient.Scan(ctx, 0, "shadow:go:market:ticker:*", 100).Iterator()
	for iter.Next(ctx) {
		pairID := strings.TrimPrefix(iter.Val(), "shadow:go:market:ticker:")
		data, err := s.redisClient.Get(ctx, iter.Val()).Result()
		if err != nil || data == "" {
			continue
		}
		if _, err := s.redisClient.Publish(ctx, channel, data).Result(); err == nil {
			count++
			s.tickerCache.Store(pairID, TickerCacheEntry{Data: data, CachedAt: time.Now()})
		}
	}
	if err := iter.Err(); err != nil {
		s.logger.Warn("redis.backfill.scan_error", "error", err.Error())
		return
	}
	if count > 0 {
		s.logger.Info("redis.backfill.published", "count", count)
	}
}

// runTickerCacheEviction periodically removes expired entries from tickerCache.
func (s *Server) runTickerCacheEviction(ctx context.Context) {
	ticker := time.NewTicker(TickerCacheEvictionInterval)
	defer ticker.Stop()

	s.logger.Info("ticker_cache.eviction_started",
		"interval", TickerCacheEvictionInterval.String(),
		"ttl", TickerCacheTTL.String())

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("ticker_cache.eviction_stopping", "reason", ctx.Err())
			return
		case <-ticker.C:
			s.evictExpiredTickers()
		}
	}
}

// evictExpiredTickers removes ticker cache entries that have exceeded TTL.
func (s *Server) evictExpiredTickers() {
	now := time.Now()
	evicted := 0

	s.tickerCache.Range(func(key, value any) bool {
		entry, ok := value.(TickerCacheEntry)
		if !ok {
			return true
		}

		if now.Sub(entry.CachedAt) > TickerCacheTTL {
			s.tickerCache.Delete(key)
			evicted++
		}
		return true
	})

	if evicted > 0 {
		s.evictedCount.Add(int64(evicted))
		s.lastEvictionUnix.Store(now.Unix())
		s.logger.Info("ticker_cache.evicted",
			"count", evicted,
			"total_evicted", s.evictedCount.Load())
	}
}

func (s *Server) isDraining() bool {
	return s.draining.Load()
}

// updateUptime updates the service uptime metric every second.
func (s *Server) updateUptime() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		metrics.ServiceUptimeSeconds.WithLabelValues(s.cfg.ServiceName).Set(time.Since(s.started).Seconds())
	}
}

func (s *Server) consumeKafka(ctx context.Context, topic string) {
	if topic == "" {
		return
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: splitCSV(s.cfg.KafkaBrokers),
		Topic:   topic,
		GroupID: s.cfg.KafkaGroup,
	})
	defer reader.Close()

	// Start Kafka stats reporting goroutine
	go s.reportKafkaStats(ctx, reader, topic)

	s.logger.Info("kafka.consumer.starting",
		"service", s.cfg.ServiceName, "topic", topic, "group", s.cfg.KafkaGroup)

	var msgCount uint64
	backoff := time.Second

	for {
		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil || s.isDraining() {
				s.logger.Info("kafka.consumer.drained", "topic", topic, "messages_processed", msgCount)
				return
			}

			if s.isConnectionError(err) {
				s.kafkaReconnects.Add(1)
				s.logger.Warn("kafka.consumer.reconnecting",
					"topic", topic, "error", err.Error(), "backoff_sec", backoff.Seconds())
				time.Sleep(s.jitterBackoff(backoff))
				if backoff < KafkaReconnectMaxSec*time.Second {
					backoff *= 2
				}
				continue
			}

			atomic.AddUint64(&s.errors, 1)
			s.logger.Warn("kafka.consumer.error", "topic", topic, "error", err.Error())
			time.Sleep(time.Second)
			continue
		}

		if err := s.handleKafkaMessageWithCache(ctx, msg); err != nil {
			atomic.AddUint64(&s.errors, 1)
			s.logger.Warn("kafka.message.handle_error",
				"topic", msg.Topic, "offset", msg.Offset, "error", err.Error())
		}

		msgCount++
		atomic.AddUint64(&s.consumed, 1)
		s.lastKafkaUnix.Store(time.Now().Unix())

		// Record metrics
		metrics.KafkaMessagesConsumed.WithLabelValues(topic).Inc()

		if msgCount <= 20 || msgCount%1000 == 0 {
			s.logger.Info("kafka.message.consumed",
				"topic", msg.Topic, "partition", msg.Partition,
				"offset", msg.Offset, "key", string(msg.Key),
				"bytes", len(msg.Value), "count", msgCount,
				"shadow_mode", s.cfg.ShadowMode,
				"read_only_mode", s.cfg.ReadOnlyMode,
				"mutations_enabled", s.cfg.MutationsEnabled)
		}
	}
}

// reportKafkaStats periodically reports Kafka reader stats for lag monitoring.
func (s *Server) reportKafkaStats(ctx context.Context, reader *kafka.Reader, topic string) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			stats := reader.Stats()
			s.kafkaLag.Store(stats.Lag)
			// Report per-partition lag if available, otherwise aggregate
			if stats.Partition >= 0 {
				metrics.KafkaConsumerLag.WithLabelValues(topic, fmt.Sprintf("%d", stats.Partition)).Set(float64(stats.Lag))
			} else {
				metrics.KafkaConsumerLag.WithLabelValues(topic, "all").Set(float64(stats.Lag))
			}
		}
	}
}
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	keywords := []string{
		"connection refused", "connection reset", "broker not available",
		"dial", "eof", "i/o timeout", "read tcp", "write tcp",
		"no such host", "network is unreachable",
	}
	for _, kw := range keywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

func (s *Server) jitterBackoff(base time.Duration) time.Duration {
	delta := time.Duration((rand.Float64()*2 - 1) * float64(base) * KafkaReconnectJitter)
	return base + delta
}

type tickerEnvelope struct {
	EventType string `json:"eventType"`
	Payload   any    `json:"payload"`
}

type tickerOuterPayload struct {
	Payload tickerPayload `json:"payload"`
}

type tickerPayload struct {
	PairID           string `json:"pairId"`
	Symbol           string `json:"symbol"`
	LastPrice        string `json:"lastPrice"`
	Bid              string `json:"bid"`
	Ask              string `json:"ask"`
	Volume24h        string `json:"volume24h"`
	Volume24hUsd     string `json:"volume24hUsd"`
	Change24h        string `json:"change24h"`
	ChangePercent24h string `json:"changePercent24h"`
	High24h          string `json:"high24h"`
	Low24h           string `json:"low24h"`
	Open24h          string `json:"open24h"`
	Timestamp        string `json:"timestamp"`
}

func (s *Server) handleKafkaMessageWithCache(ctx context.Context, msg kafka.Message) error {
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
		s.staleTickerCount.Add(1)
		return nil
	}
	compat := map[string]any{
		"pair_id":            t.PairID,
		"symbol":             t.Symbol,
		"last_price":         t.LastPrice,
		"bid":                t.Bid,
		"ask":                t.Ask,
		"volume_24h":         t.Volume24h,
		"volume_24h_usd":     t.Volume24hUsd,
		"change_24h":         t.Change24h,
		"change_percent_24h": t.ChangePercent24h,
		"high_24h":           t.High24h,
		"low_24h":            t.Low24h,
		"open_24h":           t.Open24h,
		"timestamp":          t.Timestamp,
	}
	encoded, err := json.Marshal(compat)
	if err != nil {
		return err
	}

	s.tickerCache.Store(t.PairID, TickerCacheEntry{Data: string(encoded), CachedAt: time.Now()})

	pipe := s.redisClient.Pipeline()
	pipe.Set(ctx, "shadow:go:market:ticker:"+t.PairID, encoded, 10*time.Minute)

	channel := getenv("GO_AGGREGATOR_TICKER_CHANNEL", "trading:external:ticker")

	pubStart := time.Now()
	pipe.Publish(ctx, channel, encoded)
	s.redisPublishLatencyMs.Store(time.Since(pubStart).Milliseconds())

	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}
	atomic.AddUint64(&s.published, 1)
	return nil
}

func (s *Server) handleKafkaMessage(ctx context.Context, msg kafka.Message) error {
	return s.handleKafkaMessageWithCache(ctx, msg)
}

func (s *Server) isFreshTicker(raw string) bool {
	if raw == "" {
		return false
	}
	parsed, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return false
	}
	maxAge := time.Duration(getenvInt("MARKET_AGGREGATOR_MAX_TICKER_AGE_SECONDS", 30) * time.Second
	if maxAge <= 0 {
		maxAge = 30 * time.Second
	}
	return time.Since(parsed) <= maxAge && time.Until(parsed) <= 5*time.Second
}

func (s *Server) index(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"service": s.cfg.ServiceName, "status": "ok", "mode": s.mode()})
}

func (s *Server) healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":         "ok",
		"service":        s.cfg.ServiceName,
		"uptime_seconds": int(time.Since(s.started).Seconds()),
	})
}

func (s *Server) readyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	status := http.StatusOK
	ready := map[string]any{
		"service":       s.cfg.ServiceName,
		"kafka_brokers": s.cfg.KafkaBrokers,
		"kafka_topics":  s.cfg.KafkaTopics,
		"redis_addr":    s.cfg.RedisAddr,
		"postgres_host": s.cfg.PostgresHost,
	}

	if err := s.redisClient.Ping(ctx).Err(); err != nil {
		ready["redis_status"] = "unhealthy"
		ready["redis_error"] = err.Error()
		status = http.StatusServiceUnavailable
	} else {
		ready["redis_status"] = "ok"
	}

	if time.Since(s.started) > time.Duration(KafkaStartGracePeriodSec)*time.Second {
		if s.lastKafkaUnix.Load() == 0 {
			ready["kafka_status"] = "unhealthy"
			ready["kafka_error"] = "no messages consumed within grace period"
			status = http.StatusServiceUnavailable
		} else {
			ready["kafka_status"] = "ok"
		}
	} else {
		ready["kafka_status"] = "starting"
	}

	writeJSON(w, status, ready)
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

	fmt.Fprintf(w, "# HELP aggregator_kafka_consumer_lag Estimated consumer lag from Kafka.\n# TYPE aggregator_kafka_consumer_lag gauge\naggregator_kafka_consumer_lag{service=%q} %d\n", s.cfg.ServiceName, s.kafkaLag.Load())

	fmt.Fprintf(w, "# HELP aggregator_redis_publish_latency_ms Last Redis publish latency in milliseconds.\n# TYPE aggregator_redis_publish_latency_ms gauge\naggregator_redis_publish_latency_ms{service=%q} %d\n", s.cfg.ServiceName, s.redisPublishLatencyMs.Load())

	symbolCount := int64(0)
	s.tickerCache.Range(func(_, _ any) bool {
		symbolCount++
		return true
	})
	fmt.Fprintf(w, "# HELP aggregator_symbol_count Number of unique trading pairs seen.\n# TYPE aggregator_symbol_count gauge\naggregator_symbol_count{service=%q} %d\n", s.cfg.ServiceName, symbolCount)

	fmt.Fprintf(w, "# HELP aggregator_stale_ticker_count Number of tickers older than MAX_TICKER_AGE_SECONDS.\n# TYPE aggregator_stale_ticker_count gauge\naggregator_stale_ticker_count{service=%q} %d\n", s.cfg.ServiceName, s.staleTickerCount.Load())

	fmt.Fprintf(w, "# HELP aggregator_kafka_reconnects_total Total Kafka reconnection attempts.\n# TYPE aggregator_kafka_reconnects_total counter\naggregator_kafka_reconnects_total{service=%q} %d\n", s.cfg.ServiceName, s.kafkaReconnects.Load())

	fmt.Fprintf(w, "# HELP aggregator_cache_evicted_total Total number of expired ticker cache entries evicted.\n# TYPE aggregator_cache_evicted_total counter\naggregator_cache_evicted_total{service=%q} %d\n", s.cfg.ServiceName, s.evictedCount.Load())

	fmt.Fprintf(w, "# HELP aggregator_cache_last_eviction_timestamp_seconds Timestamp of last cache eviction run.\n# TYPE aggregator_cache_last_eviction_timestamp_seconds gauge\naggregator_cache_last_eviction_timestamp_seconds{service=%q} %d\n", s.cfg.ServiceName, s.lastEvictionUnix.Load())
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
		metrics.HTTPRequestsTotal.WithLabelValues(r.Method, r.URL.Path, fmt.Sprintf("%d", 0)).Inc()
		metrics.HTTPRequestDuration.WithLabelValues(r.Method, r.URL.Path).Observe(duration)
		s.logger.Info("http.request",
			"method", r.Method, "path", r.URL.Path,
			"remote", r.RemoteAddr, "duration_ms", time.Since(started).Milliseconds())
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
