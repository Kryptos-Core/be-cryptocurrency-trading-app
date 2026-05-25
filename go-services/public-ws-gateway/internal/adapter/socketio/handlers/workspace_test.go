package handlers

import (
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"testing"

	socketio "github.com/googollee/go-socket.io"
)

func TestWorkspaceState_Empty(t *testing.T) {
	ws := &WorkspaceState{}
	if ws.Subscriptions != nil {
		t.Error("expected nil subscriptions")
	}
	if ws.DashboardJoined {
		t.Error("expected DashboardJoined=false")
	}
}

func TestSubscription_Struct(t *testing.T) {
	sub := Subscription{
		PairID:   "BTC/USDT",
		Channels: []string{"ticker", "orderbook"},
	}

	if sub.PairID != "BTC/USDT" {
		t.Errorf("PairID = %s, want BTC/USDT", sub.PairID)
	}
	if len(sub.Channels) != 2 {
		t.Errorf("Channels len = %d, want 2", len(sub.Channels))
	}
}

func TestWorkspaceState_JSON(t *testing.T) {
	ws := &WorkspaceState{
		Subscriptions: []Subscription{
			{PairID: "BTC/USDT", Channels: []string{"ticker"}},
			{PairID: "ETH/USDT", Channels: []string{"orderbook"}},
		},
		DashboardJoined: true,
	}

	data, err := json.Marshal(ws)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}

	var restored WorkspaceState
	if err := json.Unmarshal(data, &restored); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	if len(restored.Subscriptions) != 2 {
		t.Errorf("Subscriptions len = %d, want 2", len(restored.Subscriptions))
	}
	if !restored.DashboardJoined {
		t.Error("expected DashboardJoined=true")
	}
}

func TestBuildWorkspaceState_NilManager(t *testing.T) {
	state := BuildWorkspaceState(nil, "conn-1")
	if state == nil {
		t.Fatal("expected non-nil state")
	}
	if state.Subscriptions != nil {
		t.Error("expected nil subscriptions for nil manager")
	}
}

func TestBuildWorkspaceState_Empty(t *testing.T) {
	mgr := NewSubscriptionManager()
	state := BuildWorkspaceState(mgr, "nonexistent")
	if state == nil {
		t.Fatal("expected non-nil state")
	}
}

func TestIsDashboardJoined_NoSubs(t *testing.T) {
	mgr := NewSubscriptionManager()
	result := isDashboardJoined(mgr, "nonexistent")
	if result {
		t.Error("expected false for no subscriptions")
	}
}

func TestEmitWorkspaceRestored_NilConn(t *testing.T) {
	// Should not panic
	EmitWorkspaceRestored(nil, nil)
}

func TestEmitWorkspaceRestored_NilState(t *testing.T) {
	conn := &mockConnForEmit{id: "test"}
	// Should not panic
	EmitWorkspaceRestored(conn, nil)
}

type mockConnForEmit struct {
	id    string
	emits []struct {
		event string
		data  any
	}
}

var _ socketio.Conn = (*mockConnForEmit)(nil)

func (c *mockConnForEmit) ID() string                 { return c.id }
func (c *mockConnForEmit) Close() error               { return nil }
func (c *mockConnForEmit) Context() interface{}       { return nil }
func (c *mockConnForEmit) SetContext(ctx interface{}) {}
func (c *mockConnForEmit) Namespace() string          { return "/trading" }
func (c *mockConnForEmit) Emit(event string, v ...interface{}) {
	var data any
	if len(v) > 0 {
		data = v[0]
	}
	c.emits = append(c.emits, struct {
		event string
		data  any
	}{event: event, data: data})
}
func (c *mockConnForEmit) Join(room string)          {}
func (c *mockConnForEmit) Leave(room string)         {}
func (c *mockConnForEmit) LeaveAll()                 {}
func (c *mockConnForEmit) Rooms() []string           { return nil }
func (c *mockConnForEmit) URL() url.URL              { return url.URL{} }
func (c *mockConnForEmit) LocalAddr() net.Addr       { return nil }
func (c *mockConnForEmit) RemoteAddr() net.Addr      { return nil }
func (c *mockConnForEmit) RemoteHeader() http.Header { return http.Header{} }

func TestWorkspaceState_MultipleSubscriptions(t *testing.T) {
	ws := &WorkspaceState{
		Subscriptions: []Subscription{
			{PairID: "BTC/USDT", Channels: []string{"ticker", "orderbook"}},
			{PairID: "ETH/USDT", Channels: []string{"ticker"}},
			{PairID: "SOL/USDT", Channels: []string{"trades"}},
		},
		DashboardJoined: false,
	}

	if len(ws.Subscriptions) != 3 {
		t.Errorf("expected 3 subscriptions, got %d", len(ws.Subscriptions))
	}

	// Count total channels
	channelCount := 0
	for _, sub := range ws.Subscriptions {
		channelCount += len(sub.Channels)
	}
	if channelCount != 4 {
		t.Errorf("expected 4 total channels, got %d", channelCount)
	}
}
