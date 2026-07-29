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

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kryptos/go-services/matching-engine/internal/application"
	"github.com/kryptos/go-services/matching-engine/internal/application/canary"
	"github.com/kryptos/go-services/matching-engine/internal/infrastructure/persistence"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"

	"github.com/kryptos/go-services/metrics"
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
	PostgresPort     string
	PostgresUser     string
	PostgresPassword string
	PostgresDatabase string
	PostgresPoolMax  int
	BuildVersion     string
	BuildCommit      string

	CanaryPairsCSV            string
	ShadowMinMatchRate        float64
	ShadowMaxUnmatchedRuns    int
	ReconciliationIntervalSec int
}

type Server struct {
	cfg           Config
	logger        *slog.Logger
	started       time.Time
	consumed      uint64
	logged        uint64
	errors        uint64
	lastKafkaUnix atomic.Int64
	pool          *pgxpool.Pool
	redisClient   *redis.Client
	shadowEngine  *application.ShadowEngine
	canaryConfig  *canary.CanaryConfig
	reconcileSvc  *application.ReconciliationService
}

func LoadConfig(defaultServiceName, defaultPort string) Config {
	poolMax := 20
	if envPoolMax := os.Getenv("POSTGRES_POOL_MAX"); envPoolMax != "" {
		if parsed, err := strconv.Atoi(envPoolMax); err == nil && parsed > 0 {
			poolMax = parsed
		}
	}

	minMatchRate := 99.9
	if envRate := os.Getenv("MATCHING_SHADOW_MIN_MATCH_RATE_PERCENT"); envRate != "" {
		if parsed, err := strconv.ParseFloat(envRate, 64); err == nil && parsed >= 0 && parsed <= 100 {
			minMatchRate = parsed
		}
	}

	maxUnmatched := 0
	if envMax := os.Getenv("MATCHING_SHADOW_MAX_UNMATCHED_RUNS"); envMax != "" {
		if parsed, err := strconv.Atoi(envMax); err == nil && parsed >= 0 {
			maxUnmatched = parsed
		}
	}

	reconciliationInterval := 300
	if envInterval := os.Getenv("RECONCILIATION_INTERVAL_SECONDS"); envInterval != "" {
		if parsed, err := strconv.Atoi(envInterval); err == nil && parsed > 0 {
			reconciliationInterval = parsed
		}
	}

	return Config{
		ServiceName:               getenv("SERVICE_NAME", defaultServiceName),
		Env:                       getenv("SERVICE_ENV", getenv("NODE_ENV", "production")),
		HTTPAddr:                  getenv("HTTP_ADDR", ":"+defaultPort),
		ShadowMode:                getenvBool("SHADOW_MODE", true),
		ReadOnlyMode:              getenvBool("READ_ONLY_MODE", true),
		MutationsEnabled:          getenvBool("MUTATIONS_ENABLED", false),
		KafkaBrokers:              getenv("KAFKA_BROKERS", "kafka:9092"),
		KafkaGroup:                getenv("KAFKA_GROUP", defaultServiceName+"-prod-v1"),
		KafkaTopics:               splitCSV(getenv("KAFKA_TOPICS", defaultTopics(defaultServiceName))),
		RedisAddr:                 getenv("REDIS_ADDR", "redis:6379"),
		PostgresHost:              getenv("POSTGRES_HOST", "postgres"),
		PostgresPort:              getenv("POSTGRES_PORT", "5432"),
		PostgresUser:              getenv("POSTGRES_USER", "postgres"),
		PostgresPassword:          os.Getenv("POSTGRES_PASSWORD"),
		PostgresDatabase:          getenv("POSTGRES_DATABASE", "crypto_trading"),
		PostgresPoolMax:           poolMax,
		BuildVersion:              getenv("BUILD_VERSION", "dev"),
		BuildCommit:               getenv("BUILD_COMMIT", "unknown"),
		CanaryPairsCSV:            getenv("MATCHING_GO_CANARY_PAIRS", ""),
		ShadowMinMatchRate:        minMatchRate,
		ShadowMaxUnmatchedRuns:    maxUnmatched,
		ReconciliationIntervalSec: reconciliationInterval,
	}
}

func New(cfg Config) *Server {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	srv := &Server{cfg: cfg, logger: logger, started: time.Now().UTC()}
	srv.canaryConfig = canary.NewCanaryConfig(cfg.CanaryPairsCSV)
	return srv
}

func (s *Server) Run(ctx context.Context) error {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		return s.healthcheckCommand(ctx)
	}

	metrics.ServiceUp.WithLabelValues(s.cfg.ServiceName, s.cfg.Env).Set(1)
	metrics.ServiceUptimeSeconds.WithLabelValues(s.cfg.ServiceName).Set(0)
	metrics.ServiceBuildInfo.WithLabelValues(s.cfg.ServiceName, s.cfg.BuildVersion, s.cfg.BuildCommit).Set(1)
	metrics.ServiceModeInfo.WithLabelValues(
		s.cfg.ServiceName,
		strconv.FormatBool(s.cfg.ShadowMode),
		strconv.FormatBool(s.cfg.ReadOnlyMode),
		strconv.FormatBool(s.cfg.MutationsEnabled),
	).Set(1)

	go s.updateMetrics()

	if err := s.initPostgresPool(ctx); err != nil {
		s.logger.Warn("postgres.pool.init.failed", "error", err.Error())
	}
	if err := s.initRedisClient(ctx); err != nil {
		s.logger.Warn("redis.client.init.failed", "error", err.Error())
	}

	if s.pool != nil {
		shadowRepo := persistence.NewShadowRepository(s.pool)
		s.shadowEngine = application.NewShadowEngine(shadowRepo, &lockClientAdapter{s}, s.logger)
		s.reconcileSvc = application.NewReconciliationService(
			shadowRepo,
			s.logger,
			s.cfg.ShadowMinMatchRate,
			s.cfg.ShadowMaxUnmatchedRuns,
		)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.healthz)
	mux.HandleFunc("/readyz", s.readyz)
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/shadow/status", s.shadowStatus)
	mux.HandleFunc("/", s.index)

	srv2 := &http.Server{Addr: s.cfg.HTTPAddr, Handler: s.logRequests(mux), ReadHeaderTimeout: 5 * time.Second}

	stop, cancel := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	for _, topic := range s.cfg.KafkaTopics {
		go s.consumeKafka(stop, topic)
	}

	if s.reconcileSvc != nil && len(s.canaryConfig.List()) > 0 {
		go s.reconcileSvc.RunReconciliation(
			stop,
			time.Duration(s.cfg.ReconciliationIntervalSec)*time.Second,
			s.canaryConfig.List(),
		)
	}

	errCh := make(chan error, 1)
	go func() {
		s.logger.Info("service.starting",
			"service", s.cfg.ServiceName,
			"addr", s.cfg.HTTPAddr,
			"shadow_mode", s.cfg.ShadowMode,
			"read_only_mode", s.cfg.ReadOnlyMode,
			"mutations_enabled", s.cfg.MutationsEnabled,
			"kafka_topics", strings.Join(s.cfg.KafkaTopics, ","),
			"canary_pairs", s.canaryConfig.List(),
			"reconciliation_interval_sec", s.cfg.ReconciliationIntervalSec,
		)
		errCh <- srv2.ListenAndServe()
	}()

	select {
	case <-stop.Done():
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		s.logger.Info("service.shutdown")
		s.closePostgresPool(shutdownCtx)
		s.closeRedisClient()
		return srv2.Shutdown(shutdownCtx)
	case err := <-errCh:
		s.closePostgresPool(context.Background())
		s.closeRedisClient()
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func (s *Server) initPostgresPool(ctx context.Context) error {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		s.cfg.PostgresUser,
		s.cfg.PostgresPassword,
		s.cfg.PostgresHost,
		s.cfg.PostgresPort,
		s.cfg.PostgresDatabase,
	)

	poolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("failed to parse postgres config: %w", err)
	}

	poolConfig.MaxConns = int32(s.cfg.PostgresPoolMax)
	poolConfig.MinConns = 2
	poolConfig.MaxConnLifetime = 30 * time.Minute
	poolConfig.MaxConnIdleTime = 5 * time.Minute
	poolConfig.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return fmt.Errorf("failed to create postgres pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return fmt.Errorf("failed to ping postgres: %w", err)
	}

	s.pool = pool
	s.logger.Info("postgres.pool.initialized", "host", s.cfg.PostgresHost, "port", s.cfg.PostgresPort, "database", s.cfg.PostgresDatabase, "max_conns", s.cfg.PostgresPoolMax)
	return nil
}

func (s *Server) closePostgresPool(ctx context.Context) {
	if s.pool != nil {
		s.logger.Info("postgres.pool.closing")
		s.pool.Close()
		s.pool = nil
	}
}

func (s *Server) Pool() *pgxpool.Pool { return s.pool }

func (s *Server) initRedisClient(ctx context.Context) error {
	s.redisClient = redis.NewClient(&redis.Options{Addr: s.cfg.RedisAddr, Password: getenv("REDIS_PASSWORD", "")})
	if err := s.redisClient.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to ping redis: %w", err)
	}
	s.logger.Info("redis.client.initialized", "addr", s.cfg.RedisAddr)
	return nil
}

func (s *Server) closeRedisClient() {
	if s.redisClient != nil {
		s.logger.Info("redis.client.closing")
		s.redisClient.Close()
		s.redisClient = nil
	}
}

func (s *Server) RedisClient() *redis.Client { return s.redisClient }

type lockClientAdapter struct {
	srv *Server
}

func (a *lockClientAdapter) Acquire(ctx context.Context) error {
	if a.srv.redisClient == nil {
		return errors.New("redis client not initialized")
	}
	key := fmt.Sprintf("matching:shadow:lock:%s", "global")
	ok, err := a.srv.redisClient.SetNX(ctx, key, "matching-engine", 10*time.Second).Result()
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("lock not acquired")
	}
	return nil
}

func (a *lockClientAdapter) Release(ctx context.Context) error {
	if a.srv.redisClient == nil {
		return errors.New("redis client not initialized")
	}
	key := fmt.Sprintf("matching:shadow:lock:%s", "global")
	_, err := a.srv.redisClient.Del(ctx, key).Result()
	return err
}

func (s *Server) shadowStatus(w http.ResponseWriter, r *http.Request) {
	status := map[string]any{
		"shadow_engine": s.shadowEngine != nil,
		"canary_pairs":  s.canaryConfig.List(),
		"canary_count":  s.canaryConfig.Count(),
	}
	if s.shadowEngine != nil {
		m := s.shadowEngine.GetMetrics()
		status["shadow_metrics"] = m
	}
	if s.reconcileSvc != nil {
		status["reconciliation_pairs"] = s.reconcileSvc.GetPairs()
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) updateMetrics() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		metrics.ServiceUptimeSeconds.WithLabelValues(s.cfg.ServiceName).Set(time.Since(s.started).Seconds())
		if s.pool != nil {
			stats := s.pool.Stat()
			metrics.PostgresPoolIdleConns.Set(float64(stats.IdleConns()))
			metrics.PostgresPoolAcquiredConns.Set(float64(stats.AcquiredConns()))
			metrics.PostgresPoolTotalConns.Set(float64(stats.TotalConns()))
			metrics.PostgresPoolMaxConns.Set(float64(stats.MaxConns()))
		}
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
			metrics.KafkaConsumerErrors.WithLabelValues(topic).Inc()
			s.logger.Warn("kafka.consumer.error", "topic", topic, "error", err.Error())
			time.Sleep(time.Second)
			continue
		}
		count := atomic.AddUint64(&s.consumed, 1)
		s.lastKafkaUnix.Store(time.Now().Unix())
		metrics.KafkaMessagesConsumed.WithLabelValues(topic).Inc()
		if count <= 20 || count%1000 == 0 {
			atomic.AddUint64(&s.logged, 1)
			s.logger.Info("kafka.message.consumed",
				"topic", msg.Topic, "partition", msg.Partition,
				"offset", msg.Offset, "key", string(msg.Key),
				"bytes", len(msg.Value), "count", count,
				"shadow_mode", s.cfg.ShadowMode,
				"read_only_mode", s.cfg.ReadOnlyMode,
				"mutations_enabled", s.cfg.MutationsEnabled)
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
	pgStatus := "not_configured"
	if s.pool != nil {
		if err := s.pool.Ping(r.Context()); err != nil {
			pgStatus = "unhealthy"
		} else {
			pgStatus = "healthy"
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":          "ready",
		"service":         s.cfg.ServiceName,
		"kafka_brokers":   s.cfg.KafkaBrokers,
		"kafka_topics":    s.cfg.KafkaTopics,
		"redis_addr":      s.cfg.RedisAddr,
		"postgres_host":   s.cfg.PostgresHost,
		"postgres_status": pgStatus,
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
