package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Service metrics (shared across all services)
var (
	ServiceUp = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "go_service_up",
		Help: "Service liveness (1 = up, 0 = down)",
	}, []string{"service", "env"})

	ServiceUptimeSeconds = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "go_service_uptime_seconds",
		Help: "Service uptime in seconds",
	}, []string{"service"})

	ServiceBuildInfo = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "go_service_build_info",
		Help: "Build metadata",
	}, []string{"service", "version", "commit"})

	ServiceModeInfo = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "go_service_mode_info",
		Help: "Service safety mode flags",
	}, []string{"service", "shadow_mode", "read_only_mode", "mutations_enabled"})
)

// HTTP metrics
var (
	HTTPRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total HTTP requests",
	}, []string{"method", "path", "status"})

	HTTPRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request duration",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "path"})

	HTTPRequestsInFlight = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "http_requests_in_flight",
		Help: "HTTP requests currently being processed",
	})
)

// Market Aggregator metrics
var (
	KafkaMessagesConsumed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "aggregator_kafka_messages_total",
		Help: "Kafka messages consumed",
	}, []string{"topic"})

	KafkaConsumerErrors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "aggregator_kafka_errors_total",
		Help: "Kafka consumer errors",
	}, []string{"topic"})

	KafkaConsumerLag = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "aggregator_kafka_consumer_lag",
		Help: "Kafka consumer lag (estimated)",
	}, []string{"topic", "partition"})

	KafkaReconnects = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "aggregator_kafka_reconnects_total",
		Help: "Kafka reconnection attempts",
	}, []string{"topic"})

	RedisPublishedTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "aggregator_redis_published_total",
		Help: "Redis messages published",
	})

	RedisPublishLatency = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "aggregator_redis_publish_latency_ms",
		Help:    "Redis publish latency in milliseconds",
		Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000},
	})

	AggregatorSymbolCount = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "aggregator_symbol_count",
		Help: "Number of unique symbols tracked",
	})

	AggregatorStaleTickerCount = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "aggregator_stale_ticker_count",
		Help: "Number of tickers older than max age",
	})

	AggregatorLastTickerTimestamp = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "aggregator_last_ticker_timestamp_seconds",
		Help: "Timestamp of last received ticker",
	})
)

// Matching Engine metrics
var (
	MatchingOrdersProcessed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "matching_orders_processed_total",
		Help: "Orders processed",
	}, []string{"mode", "pair", "side"})

	MatchingTradesCreated = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "matching_trades_created_total",
		Help: "Trades created",
	}, []string{"pair"})

	MatchingExecutionLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "matching_execution_latency_ms",
		Help:    "Matching execution latency",
		Buckets: []float64{0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000},
	}, []string{"pair"})

	MatchingLockAcquired = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "matching_lock_acquired_total",
		Help: "Lock acquisitions",
	}, []string{"pair"})

	MatchingLockContention = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "matching_lock_contention_total",
		Help: "Lock contention (retries)",
	}, []string{"pair"})

	MatchingLockFailed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "matching_lock_failed_total",
		Help: "Failed lock acquisitions",
	}, []string{"pair"})

	MatchingCircuitBreakerHalted = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "matching_circuit_breaker_halted_total",
		Help: "Orders halted by circuit breaker",
	}, []string{"pair"})

	MatchingPriceDeviationRejected = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "matching_price_deviation_rejected_total",
		Help: "Orders rejected due to price deviation",
	}, []string{"pair"})

	MatchingShadowMatchRate = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "matching_shadow_match_rate_percent",
		Help: "Shadow matching match rate",
	}, []string{"pair"})

	MatchingShadowUnmatched = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "matching_shadow_unmatched_total",
		Help: "Shadow runs without matching trade",
	}, []string{"pair"})

	MatchingShadowProcessed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "matching_shadow_processed_total",
		Help: "Shadow matching runs processed",
	}, []string{"pair", "status"})

	MatchingDBTransactionDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "matching_db_transaction_duration_ms",
		Help:    "DB transaction duration",
		Buckets: []float64{1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500},
	}, []string{"pair"})

	PostgresPoolIdleConns = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "go_postgres_pool_idle_connections",
		Help: "Idle connections in pool",
	})

	PostgresPoolAcquiredConns = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "go_postgres_pool_acquired_connections",
		Help: "Acquired connections from pool",
	})

	PostgresPoolTotalConns = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "go_postgres_pool_total_connections",
		Help: "Total connections in pool",
	})

	PostgresPoolMaxConns = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "go_postgres_pool_max_connections",
		Help: "Max connections in pool",
	})

	PostgresPoolEmptyAcquisitions = promauto.NewCounter(prometheus.CounterOpts{
		Name: "go_postgres_pool_empty_acquisitions",
		Help: "Total times pool was empty on acquire",
	})

	PostgresPoolCanceledAcquisitions = promauto.NewCounter(prometheus.CounterOpts{
		Name: "go_postgres_pool_canceled_acquisitions",
		Help: "Total canceled acquisitions",
	})
)

// Public WS Gateway metrics
var (
	WSConnectionsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ws_connections_total",
		Help: "WebSocket connections",
	}, []string{"namespace", "type"})

	WSConnectionsCurrent = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ws_connections_current",
		Help: "Current WebSocket connections",
	}, []string{"namespace"})

	WSSubscriptionsCurrent = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "ws_subscriptions_current",
		Help: "Current subscriptions",
	})

	WSMessagesSent = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ws_messages_sent_total",
		Help: "WebSocket messages sent",
	}, []string{"namespace", "event"})

	WSMessagesReceived = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ws_messages_received_total",
		Help: "WebSocket messages received",
	}, []string{"namespace", "event"})

	WSAuthFailures = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ws_auth_failures_total",
		Help: "WebSocket authentication failures",
	}, []string{"namespace"})

	WSSubscribeOperations = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ws_subscribe_operations_total",
		Help: "Subscription operations",
	}, []string{"namespace", "operation"})
)

// Kafka Producer metrics (shared)
var (
	KafkaProducerMessages = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "kafka_producer_messages_total",
		Help: "Kafka messages produced",
	}, []string{"topic"})

	KafkaProducerErrors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "kafka_producer_errors_total",
		Help: "Kafka producer errors",
	}, []string{"topic"})

	KafkaProducerLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "kafka_producer_latency_ms",
		Help:    "Kafka producer latency",
		Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500},
	}, []string{"topic"})
)
