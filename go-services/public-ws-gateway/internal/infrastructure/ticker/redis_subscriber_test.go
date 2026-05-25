package ticker

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// MockTickerHandler implements ticker.TickerHandler for testing.
type MockTickerHandler struct {
	tickers []TickerData
}

func NewMockTickerHandler() *MockTickerHandler {
	return &MockTickerHandler{tickers: make([]TickerData, 0)}
}

func (m *MockTickerHandler) OnTicker(_ context.Context, data *TickerData) {
	m.tickers = append(m.tickers, *data)
}

func (m *MockTickerHandler) GetTickers() []TickerData {
	return m.tickers
}

func TestMockTickerHandler(t *testing.T) {
	handler := NewMockTickerHandler()

	data := &TickerData{
		PairID:    "BTC/USDT",
		LastPrice: "50000.00",
	}

	handler.OnTicker(context.Background(), data)

	tickers := handler.GetTickers()
	assert.Len(t, tickers, 1)
	assert.Equal(t, "BTC/USDT", tickers[0].PairID)
}

func TestRedisSubscriberError(t *testing.T) {
	err := ErrRedisClientNil
	if err == nil {
		t.Fatal("expected non-nil error")
	}
	if err.Error() != "redis client is nil" {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

func TestNewRedisSubscriber(t *testing.T) {
	handler := NewMockTickerHandler()
	sub := NewRedisSubscriber(nil, "test-channel", handler, nil)
	if sub == nil {
		t.Fatal("expected non-nil subscriber")
	}
	if sub.GetChannel() != "test-channel" {
		t.Errorf("expected channel=test-channel, got %s", sub.GetChannel())
	}
}

func TestNewRedisSubscriber_EmptyChannel(t *testing.T) {
	handler := NewMockTickerHandler()
	sub := NewRedisSubscriber(nil, "", handler, nil)
	if sub.GetChannel() != DefaultChannel {
		t.Errorf("expected channel=%s, got %s", DefaultChannel, sub.GetChannel())
	}
}

func TestRedisSubscriberHealthCheck(t *testing.T) {
	handler := NewMockTickerHandler()
	sub := NewRedisSubscriber(nil, "test-channel", handler, nil)

	err := sub.HealthCheck(context.Background())
	if err == nil {
		t.Error("expected error for nil redis client")
	}
}

func TestTickerDataJSON(t *testing.T) {
	td := &TickerData{
		PairID:           "ETH/USDT",
		Symbol:           "ETHUSDT",
		LastPrice:        "3000.00",
		Bid:              "2999.00",
		Ask:              "3001.00",
		Volume24h:        "50000.00",
		Volume24hUsd:     "150000000.00",
		Change24h:        "50.00",
		ChangePercent24h: "1.69",
		High24h:          "3050.00",
		Low24h:           "2950.00",
		Open24h:          "2950.00",
		Timestamp:        "1704067200",
	}

	data, err := json.Marshal(td)
	require.NoError(t, err)

	var restored TickerData
	err = json.Unmarshal(data, &restored)
	require.NoError(t, err)

	assert.Equal(t, td.PairID, restored.PairID)
	assert.Equal(t, td.LastPrice, restored.LastPrice)
	assert.Equal(t, td.Volume24hUsd, restored.Volume24hUsd)
}

func TestTickerDataFields(t *testing.T) {
	td := TickerData{
		PairID:           "SOL/USDT",
		Symbol:           "SOLUSDT",
		LastPrice:        "100.50",
		Bid:              "100.49",
		Ask:              "100.51",
		Volume24h:        "5000000.00",
		Volume24hUsd:     "502500000.00",
		Change24h:        "5.25",
		ChangePercent24h: "5.50",
		High24h:          "102.00",
		Low24h:           "95.00",
		Open24h:          "95.25",
		Timestamp:        "1704067200",
	}

	assert.Equal(t, "SOL/USDT", td.PairID)
	assert.Equal(t, "SOLUSDT", td.Symbol)
	assert.Equal(t, "100.50", td.LastPrice)
	assert.Equal(t, "5.50", td.ChangePercent24h)
}

// Verify MockTickerHandler implements TickerHandler
var _ TickerHandler = (*MockTickerHandler)(nil)

// TestRedisSubscriberErrorStruct tests the error struct.
func TestRedisSubscriberErrorStruct(t *testing.T) {
	errMsg := "custom redis error"
	err := &RedisSubscriberError{message: errMsg}
	if err.Error() != errMsg {
		t.Errorf("Error() = %q, want %q", err.Error(), errMsg)
	}
}
