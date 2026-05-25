package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kryptos/go-services/public-ws-gateway/internal/adapter/socketio"
	"github.com/kryptos/go-services/public-ws-gateway/internal/adapter/socketio/handlers"
)

// TestConfigLoad tests the LoadConfig function.
func TestConfigLoad(t *testing.T) {
	cfg := LoadConfig("public-ws-gateway", "8080")
	if cfg.ServiceName != "public-ws-gateway" {
		t.Errorf("expected service name public-ws-gateway, got %s", cfg.ServiceName)
	}
}

// TestServerIndex tests the index handler.
func TestServerIndex(t *testing.T) {
	srv := &Server{cfg: Config{ServiceName: "test-service", Env: "test"}}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	srv.index(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "test-service", resp["service"])
	assert.Equal(t, "ok", resp["status"])
	assert.Equal(t, "test", resp["env"])
}

// TestServerHealthz tests the healthz handler.
func TestServerHealthz(t *testing.T) {
	srv := &Server{cfg: Config{ServiceName: "test-service"}}

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()

	srv.healthz(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "ok", resp["status"])
}

// TestServerReadyz tests the readyz handler.
func TestServerReadyz(t *testing.T) {
	srv := &Server{cfg: Config{ServiceName: "test-service", RedisAddr: "localhost:6379", KafkaBrokers: "localhost:9092"}}

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	w := httptest.NewRecorder()

	srv.readyz(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "ready", resp["status"])
	assert.Equal(t, "test-service", resp["service"])
}

// TestTickerMessageJSON tests TickerMessage JSON serialization.
func TestTickerMessageJSON(t *testing.T) {
	msg := &socketio.TickerMessage{
		PairID:           "BTC/USDT",
		Symbol:           "BTCUSDT",
		LastPrice:        "50000.00",
		Bid:              "49999.00",
		Ask:              "50001.00",
		Volume24h:        "1000.5",
		Volume24hUsd:     "50000000.00",
		Change24h:        "500.00",
		ChangePercent24h: "1.01",
		High24h:          "51000.00",
		Low24h:           "49000.00",
		Open24h:          "49500.00",
		Timestamp:        "1704067200",
	}

	data, err := json.Marshal(msg)
	require.NoError(t, err)

	var parsed socketio.TickerMessage
	err = json.Unmarshal(data, &parsed)
	require.NoError(t, err)

	assert.Equal(t, msg.PairID, parsed.PairID)
	assert.Equal(t, msg.LastPrice, parsed.LastPrice)
}

// TestSocketIOConstants tests Socket.IO constants.
func TestSocketIOConstants(t *testing.T) {
	assert.Equal(t, "/trading", socketio.NamespaceTrading)
	assert.Equal(t, "dashboard", socketio.RoomDashboard)
	assert.Equal(t, "ticker", socketio.TickerChannel)
}

// TestHandlerEventConstants tests handler event constants.
func TestHandlerEventConstants(t *testing.T) {
	assert.NotEmpty(t, handlers.EventAuthResponse)
	assert.NotEmpty(t, handlers.EventSubscribed)
	assert.NotEmpty(t, handlers.EventUnsubscribed)
	assert.NotEmpty(t, handlers.EventError)
	assert.NotEmpty(t, handlers.EventDashboardJoined)
	assert.NotEmpty(t, handlers.EventDashboardLeft)
}

// TestErrorCodeConstants tests error code constants.
func TestErrorCodeConstants(t *testing.T) {
	assert.Equal(t, "AUTH_FAILED", handlers.ErrCodeAuthFailed)
	assert.Equal(t, "INVALID_TOKEN", handlers.ErrCodeInvalidToken)
	assert.Equal(t, "TOKEN_EXPIRED", handlers.ErrCodeTokenExpired)
	assert.Equal(t, "INVALID_PARAMS", handlers.ErrCodeInvalidParams)
	assert.Equal(t, "SERVER_ERROR", handlers.ErrCodeServerError)
	assert.Equal(t, "NOT_AUTHORIZED", handlers.ErrCodeNotAuthorized)
}

// TestBuildAuthResponse tests auth response builder.
func TestBuildAuthResponse(t *testing.T) {
	// Success case
	resp := handlers.BuildAuthResponse(true, "user-123", "trader", "")
	assert.Equal(t, true, resp["success"])
	assert.Equal(t, "user-123", resp["user_id"])
	assert.Equal(t, "trader", resp["role"])

	// Failure case
	resp = handlers.BuildAuthResponse(false, "", "", "invalid token")
	assert.Equal(t, false, resp["success"])
	assert.Equal(t, "invalid token", resp["error"])
}

// TestBuildSubscribedEvent tests subscribed event builder.
func TestBuildSubscribedEvent(t *testing.T) {
	resp := handlers.BuildSubscribedEvent("BTC/USDT", []string{"ticker", "orderbook"})
	assert.Equal(t, "subscribed", resp["event"])
	assert.Equal(t, "BTC/USDT", resp["pair_id"])
}

// TestBuildUnsubscribedEvent tests unsubscribed event builder.
func TestBuildUnsubscribedEvent(t *testing.T) {
	resp := handlers.BuildUnsubscribedEvent("ETH/USDT", []string{"ticker"})
	assert.Equal(t, "unsubscribed", resp["event"])
	assert.Equal(t, "ETH/USDT", resp["pair_id"])
}

// TestBuildErrorEvent tests error event builder.
func TestBuildErrorEvent(t *testing.T) {
	details := map[string]any{"field": "token"}
	resp := handlers.BuildErrorEvent(handlers.ErrCodeTokenExpired, "Token expired", details)
	assert.Equal(t, handlers.ErrCodeTokenExpired, resp["code"])
	assert.Equal(t, "Token expired", resp["message"])
}

// TestBuildErrorEventNoDetails tests error event without details.
func TestBuildErrorEventNoDetails(t *testing.T) {
	resp := handlers.BuildErrorEvent(handlers.ErrCodeServerError, "Internal error", nil)
	assert.Equal(t, handlers.ErrCodeServerError, resp["code"])
	assert.Equal(t, "Internal error", resp["message"])
}

// TestBuildDashboardJoinedEvent tests dashboard joined event.
func TestBuildDashboardJoinedEvent(t *testing.T) {
	resp := handlers.BuildDashboardJoinedEvent()
	assert.Equal(t, "dashboard_joined", resp["event"])
}

// TestBuildDashboardLeftEvent tests dashboard left event.
func TestBuildDashboardLeftEvent(t *testing.T) {
	resp := handlers.BuildDashboardLeftEvent()
	assert.Equal(t, "dashboard_left", resp["event"])
}

// TestSubscriptionManager tests subscription manager creation.
func TestSubscriptionManager(t *testing.T) {
	mgr := handlers.NewSubscriptionManager()
	if mgr == nil {
		t.Fatal("expected non-nil SubscriptionManager")
	}
}

// TestSubscriptionManagerCount tests connection count.
func TestSubscriptionManagerCount(t *testing.T) {
	mgr := handlers.NewSubscriptionManager()
	count := mgr.Count()
	if count != 0 {
		t.Errorf("expected 0 connections, got %d", count)
	}
}

// TestWorkspaceStateBuild tests workspace state building.
func TestWorkspaceStateBuild(t *testing.T) {
	mgr := handlers.NewSubscriptionManager()
	state := handlers.BuildWorkspaceState(mgr, "test-conn")
	if state == nil {
		t.Fatal("expected non-nil state")
	}
	if state.DashboardJoined {
		t.Error("expected DashboardJoined=false")
	}
}

// TestSplitCSV tests the splitCSV helper.
func TestSplitCSV(t *testing.T) {
	tests := []struct {
		input    string
		expected []string
	}{
		{"", []string{}},
		{"single", []string{"single"}},
		{"a,b,c", []string{"a", "b", "c"}},
		{"a, b, c", []string{"a", "b", "c"}},
		{"a,,c", []string{"a", "c"}},
	}

	for _, tt := range tests {
		result := splitCSV(tt.input)
		assert.Equal(t, tt.expected, result)
	}
}

// TestGetenvHelpers tests getenv helpers.
func TestGetenvHelpers(t *testing.T) {
	t.Setenv("TEST_STRING", "test-value")
	t.Setenv("TEST_BOOL_TRUE", "true")
	t.Setenv("TEST_BOOL_FALSE", "false")

	assert.Equal(t, "test-value", getenv("TEST_STRING", "default"))
	assert.Equal(t, "default", getenv("NONEXISTENT", "default"))
	assert.True(t, getenvBool("TEST_BOOL_TRUE", false))
	assert.False(t, getenvBool("TEST_BOOL_FALSE", true))
	assert.False(t, getenvBool("NONEXISTENT", false))
	assert.True(t, getenvBool("NONEXISTENT", true))
}

// TestWriteJSON tests the writeJSON helper.
func TestWriteJSON(t *testing.T) {
	w := httptest.NewRecorder()
	data := map[string]any{"key": "value", "num": 42}

	writeJSON(w, http.StatusOK, data)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var result map[string]any
	err := json.Unmarshal(w.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "value", result["key"])
}

// TestPortFromAddr tests port extraction from address.
func TestPortFromAddr(t *testing.T) {
	tests := []struct {
		addr     string
		expected int
	}{
		{":8080", 8080},
		{":9090", 9090},
		{"8080", 8080},
		{"", 8080},
	}

	for _, tt := range tests {
		result := portFromAddr(tt.addr)
		assert.Equal(t, tt.expected, result)
	}
}
