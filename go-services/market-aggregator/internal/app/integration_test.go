package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/segmentio/kafka-go"
)

// TestHealthzEndpoint tests the /healthz endpoint.
func TestHealthzEndpoint(t *testing.T) {
	srv := &Server{
		cfg: Config{
			ServiceName: "market-aggregator",
			HTTPAddr:    ":8080",
		},
		started: time.Now().UTC(),
	}

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()

	srv.healthz(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.Equal(t, "ok", resp["status"])
	assert.Equal(t, "market-aggregator", resp["service"])
	assert.NotNil(t, resp["uptime_seconds"])
}

// TestTickerCacheOperations tests ticker cache operations.
func TestTickerCacheOperations(t *testing.T) {
	srv := &Server{
		tickerCache: sync.Map{},
	}

	// Test storing a ticker
	pairID := "BTC/USDT"
	tickerJSON := `{"pair_id":"BTC/USDT","symbol":"BTC-USDT","last_price":"50000"}`

	srv.tickerCache.Store(pairID, tickerJSON)

	// Test retrieving a ticker
	val, ok := srv.tickerCache.Load(pairID)
	assert.True(t, ok)
	assert.Equal(t, tickerJSON, val)

	// Test deleting a ticker
	srv.tickerCache.Delete(pairID)
	_, ok = srv.tickerCache.Load(pairID)
	assert.False(t, ok)

	// Test storing multiple tickers
	tickers := map[string]string{
		"BTC/USDT": `{"pair_id":"BTC/USDT","last_price":"50000"}`,
		"ETH/USDT": `{"pair_id":"ETH/USDT","last_price":"3000"}`,
		"SOL/USDT": `{"pair_id":"SOL/USDT","last_price":"100"}`,
	}

	for k, v := range tickers {
		srv.tickerCache.Store(k, v)
	}

	// Count tickers
	count := 0
	srv.tickerCache.Range(func(_, _ interface{}) bool {
		count++
		return true
	})
	assert.Equal(t, 3, count)
}

// TestIsFreshTicker tests the isFreshTicker function.
func TestIsFreshTicker(t *testing.T) {
	srv := &Server{}

	tests := []struct {
		name      string
		timestamp string
		expected  bool
	}{
		{
			name:      "valid timestamp",
			timestamp: time.Now().Format(time.RFC3339Nano),
			expected:  true,
		},
		{
			name:      "empty timestamp",
			timestamp: "",
			expected:  false,
		},
		{
			name:      "invalid format",
			timestamp: "invalid",
			expected:  false,
		},
		{
			name:      "old timestamp",
			timestamp: time.Now().Add(-1 * time.Hour).Format(time.RFC3339Nano),
			expected:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := srv.isFreshTicker(tt.timestamp)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestModeFunction tests the mode() function.
func TestModeFunction(t *testing.T) {
	tests := []struct {
		name     string
		cfg      Config
		expected string
	}{
		{
			name: "shadow mode",
			cfg: Config{
				ShadowMode:   true,
				ReadOnlyMode: false,
			},
			expected: "shadow",
		},
		{
			name: "read only mode",
			cfg: Config{
				ShadowMode:   false,
				ReadOnlyMode: true,
			},
			expected: "read_only",
		},
		{
			name: "active mode",
			cfg: Config{
				ShadowMode:   false,
				ReadOnlyMode: false,
			},
			expected: "active",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := &Server{cfg: tt.cfg}
			assert.Equal(t, tt.expected, srv.mode())
		})
	}
}

// TestSplitCSV tests the splitCSV helper function.
func TestSplitCSV(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{"single value", "value1", []string{"value1"}},
		{"multiple values", "value1,value2,value3", []string{"value1", "value2", "value3"}},
		{"with spaces", "value1 , value2 , value3", []string{"value1", "value2", "value3"}},
		{"empty strings", "value1,,value2,", []string{"value1", "value2"}},
		{"empty input", "", []string{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := splitCSV(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestDefaultTopics tests the defaultTopics function.
func TestDefaultTopics(t *testing.T) {
	tests := []struct {
		service  string
		expected string
	}{
		{"matching-engine", "crypto-trading.orderplaced,crypto-trading.ordercancelled,crypto-trading.tradeexecuted"},
		{"market-aggregator", "crypto-trading.tradeexecuted,crypto-trading.market.ticker,market.ticker"},
		{"unknown", "crypto-trading.tradeexecuted,crypto-trading.market.ticker,market.ticker"},
	}

	for _, tt := range tests {
		t.Run(tt.service, func(t *testing.T) {
			result := defaultTopics(tt.service)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestGetenvHelpers tests the getenv helper functions.
func TestGetenvHelpers(t *testing.T) {
	t.Setenv("TEST_STRING", "test-value")
	t.Setenv("TEST_BOOL_TRUE", "true")
	t.Setenv("TEST_BOOL_FALSE", "false")

	assert.Equal(t, "test-value", getenv("TEST_STRING", "default"))
	assert.Equal(t, "default", getenv("NONEXISTENT", "default"))
	assert.True(t, getenvBool("TEST_BOOL_TRUE", false))
	assert.False(t, getenvBool("TEST_BOOL_FALSE", true))
	assert.True(t, getenvBool("NONEXISTENT", true))
	assert.False(t, getenvBool("NONEXISTENT", false))
}

// TestWriteJSON tests the writeJSON helper function.
func TestWriteJSON(t *testing.T) {
	w := httptest.NewRecorder()

	data := map[string]interface{}{
		"key1": "value1",
		"key2": 42,
		"key3": true,
	}

	writeJSON(w, http.StatusOK, data)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var result map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &result)
	require.NoError(t, err)

	assert.Equal(t, "value1", result["key1"])
	assert.Equal(t, float64(42), result["key2"])
	assert.Equal(t, true, result["key3"])
}

// TestJitterBackoff tests the jitterBackoff function.
func TestJitterBackoff(t *testing.T) {
	srv := &Server{}
	base := 100 * time.Millisecond

	results := make([]time.Duration, 20)
	for i := 0; i < 20; i++ {
		results[i] = srv.jitterBackoff(base)
	}

	for _, result := range results {
		assert.GreaterOrEqual(t, result, time.Duration(float64(base)*0.7))
		assert.LessOrEqual(t, result, time.Duration(float64(base)*1.3))
	}

	hasVariation := false
	for i := 1; i < len(results); i++ {
		if results[i] != results[0] {
			hasVariation = true
			break
		}
	}
	assert.True(t, hasVariation, "Expected some variation in backoff times")
}

// TestDrainingFlag tests the draining flag functionality.
func TestDrainingFlag(t *testing.T) {
	srv := &Server{}

	assert.False(t, srv.isDraining())

	srv.draining.Store(true)
	assert.True(t, srv.isDraining())

	srv.draining.Store(false)
	assert.False(t, srv.isDraining())
}

// TestKafkaMessageParsing tests Kafka message parsing.
func TestKafkaMessageParsing(t *testing.T) {
	msg := kafka.Message{
		Topic: "market.ticker",
		Key:   []byte("BTC/USDT"),
		Value: []byte(`{"eventType":"ticker","payload":{}}`),
	}

	assert.Equal(t, "market.ticker", msg.Topic)
	assert.Equal(t, "BTC/USDT", string(msg.Key))
}

// TestHandleKafkaMessage tests handleKafkaMessage with various inputs.
func TestHandleKafkaMessage(t *testing.T) {
	srv := &Server{
		cfg: Config{
			ServiceName: "market-aggregator",
		},
		tickerCache: sync.Map{},
	}

	// Test with market.ticker topic (should be processed)
	msg := kafka.Message{
		Topic: "market.ticker",
		Key:   []byte("BTC/USDT"),
		Value: []byte(`{"eventType":"ticker","payload":{"payload":{"pairId":"BTC/USDT","symbol":"BTCUSDT","lastPrice":"50000","timestamp":"` + time.Now().Format(time.RFC3339Nano) + `"}}}`),
	}

	err := srv.handleKafkaMessage(context.Background(), msg)
	assert.NoError(t, err)
}

// TestLoadConfig tests the LoadConfig function.
func TestLoadConfig(t *testing.T) {
	t.Setenv("SERVICE_NAME", "test-aggregator")
	t.Setenv("SERVICE_ENV", "test")
	t.Setenv("HTTP_ADDR", ":9090")
	t.Setenv("SHADOW_MODE", "false")
	t.Setenv("READ_ONLY_MODE", "false")
	t.Setenv("MUTATIONS_ENABLED", "true")
	t.Setenv("KAFKA_BROKERS", "kafka1:9092,kafka2:9092")
	t.Setenv("REDIS_ADDR", "redis-test:6379")

	cfg := LoadConfig("default-service", "8080")

	assert.Equal(t, "test-aggregator", cfg.ServiceName)
	assert.Equal(t, "test", cfg.Env)
	assert.Equal(t, ":9090", cfg.HTTPAddr)
	assert.False(t, cfg.ShadowMode)
	assert.False(t, cfg.ReadOnlyMode)
	assert.True(t, cfg.MutationsEnabled)
}

// TestConfigDefaults tests default configuration values.
func TestConfigDefaults(t *testing.T) {
	cfg := LoadConfig("test-service", "8080")

	assert.Equal(t, "test-service", cfg.ServiceName)
	assert.Equal(t, ":8080", cfg.HTTPAddr)
	assert.NotEmpty(t, cfg.KafkaBrokers)
	assert.NotEmpty(t, cfg.RedisAddr)
}

// TestServerIndex tests the index handler.
func TestServerIndex(t *testing.T) {
	srv := &Server{
		cfg: Config{
			ServiceName: "market-aggregator",
			Env:         "production",
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	srv.index(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.Equal(t, "market-aggregator", resp["service"])
	assert.Equal(t, "ok", resp["status"])
}

// TestTickerEnvelopeParsing tests parsing of ticker envelope messages.
func TestTickerEnvelopeParsing(t *testing.T) {
	srv := &Server{
		tickerCache: sync.Map{},
	}

	validMsg := `{
		"eventType": "ticker",
		"payload": {
			"payload": {
				"pairId": "BTC/USDT",
				"symbol": "BTC-USDT",
				"lastPrice": "50000.00",
				"bid": "49999.00",
				"ask": "50001.00",
				"volume24h": "1000.5",
				"volume24hUsd": "50000000.00",
				"change24h": "500.00",
				"changePercent24h": "1.01",
				"high24h": "51000.00",
				"low24h": "49000.00",
				"open24h": "49500.00",
				"timestamp": "` + time.Now().Format(time.RFC3339Nano) + `"
			}
		}
	}`

	msg := kafka.Message{
		Topic: "market.ticker",
		Key:   []byte("BTC/USDT"),
		Value: []byte(validMsg),
	}

	err := srv.handleKafkaMessage(context.Background(), msg)
	assert.NoError(t, err)
}
