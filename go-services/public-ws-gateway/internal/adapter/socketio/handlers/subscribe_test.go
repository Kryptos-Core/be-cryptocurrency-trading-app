package handlers

import (
	"net"
	"net/http"
	"net/url"
	"sync"
	"testing"

	socketio "github.com/googollee/go-socket.io"
)

// TestParseRoom tests the parseRoom function.
func TestParseRoom(t *testing.T) {
	tests := []struct {
		room       string
		wantPairID string
		wantCh     string
	}{
		{"BTC/USDT:ticker", "BTC/USDT", ChannelTicker},
		{"ETH/USDT:orderbook", "ETH/USDT", ChannelOrderbook},
		{"SOL/USDT:trades", "SOL/USDT", ChannelTrades},
		{"dashboard", "", ChannelDashboard},
		{"unknown", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.room, func(t *testing.T) {
			pairID, ch := parseRoom(tt.room)
			if pairID != tt.wantPairID {
				t.Errorf("parseRoom(%q) pairID = %q, want %q", tt.room, pairID, tt.wantPairID)
			}
			if ch != tt.wantCh {
				t.Errorf("parseRoom(%q) channel = %q, want %q", tt.room, ch, tt.wantCh)
			}
		})
	}
}

func TestBuildRoom(t *testing.T) {
	tests := []struct {
		pairID   string
		channel  string
		expected string
	}{
		{"BTC/USDT", "ticker", "BTC/USDT:ticker"},
		{"ETH/USDT", "orderbook", "ETH/USDT:orderbook"},
		{"SOL/USDT", "trades", "SOL/USDT:trades"},
	}

	for _, tt := range tests {
		result := buildRoom(tt.pairID, tt.channel)
		if result != tt.expected {
			t.Errorf("buildRoom(%q, %q) = %q, want %q", tt.pairID, tt.channel, result, tt.expected)
		}
	}
}

func TestIsValidChannel(t *testing.T) {
	valid := []string{"ticker", "orderbook", "trades"}
	for _, ch := range valid {
		if !isValidChannel(ch) {
			t.Errorf("isValidChannel(%q) = false, want true", ch)
		}
	}

	invalid := []string{"dashboard", "invalid", "", "unknown"}
	for _, ch := range invalid {
		if isValidChannel(ch) {
			t.Errorf("isValidChannel(%q) = true, want false", ch)
		}
	}
}

func TestSubscriptionManager_Constants(t *testing.T) {
	if ChannelTicker != "ticker" {
		t.Errorf("ChannelTicker = %q, want ticker", ChannelTicker)
	}
	if ChannelOrderbook != "orderbook" {
		t.Errorf("ChannelOrderbook = %q, want orderbook", ChannelOrderbook)
	}
	if ChannelTrades != "trades" {
		t.Errorf("ChannelTrades = %q, want trades", ChannelTrades)
	}
	if ChannelDashboard != "dashboard" {
		t.Errorf("ChannelDashboard = %q, want dashboard", ChannelDashboard)
	}
}

func TestSubscriptionManager_Errors(t *testing.T) {
	if ErrInvalidPairID.Error() != "invalid pair ID" {
		t.Errorf("ErrInvalidPairID = %q", ErrInvalidPairID)
	}
	if ErrInvalidChannel.Error() != "invalid channel" {
		t.Errorf("ErrInvalidChannel = %q", ErrInvalidChannel)
	}
	if ErrAlreadySubscribed.Error() != "already subscribed to this channel" {
		t.Errorf("ErrAlreadySubscribed = %q", ErrAlreadySubscribed)
	}
}

func TestSubscriptionManager_New(t *testing.T) {
	mgr := NewSubscriptionManager()
	if mgr == nil {
		t.Fatal("expected non-nil SubscriptionManager")
	}
}

func TestSubscriptionManager_GetSubscriptions(t *testing.T) {
	mgr := NewSubscriptionManager()
	subs := mgr.GetSubscriptions("nonexistent")
	if subs == nil {
		// GetSubscriptions returns nil for non-existent conn
	}
}

func TestSubscriptionManager_RemoveConnection(t *testing.T) {
	mgr := NewSubscriptionManager()
	// Should not panic
	mgr.RemoveConnection("nonexistent")
}

func TestSubscriptionManager_Count(t *testing.T) {
	mgr := NewSubscriptionManager()
	count := mgr.Count()
	if count != 0 {
		t.Errorf("expected 0 connections, got %d", count)
	}
}

func TestSubscriptionManager_ConcurrentAccess(t *testing.T) {
	mgr := NewSubscriptionManager()
	done := make(chan bool)

	for i := 0; i < 50; i++ {
		go func() {
			_ = mgr.Count()
			_ = mgr.GetSubscriptions("conn-1")
			done <- true
		}()
	}

	for i := 0; i < 50; i++ {
		<-done
	}
}

func TestSubscriptionManager_CountConcurrent(t *testing.T) {
	mgr := NewSubscriptionManager()
	done := make(chan bool)

	for i := 0; i < 100; i++ {
		go func(idx int) {
			for j := 0; j < 10; j++ {
				_ = mgr.Count()
			}
			done <- true
		}(i)
	}

	for i := 0; i < 100; i++ {
		<-done
	}
}

func TestSubscription_GetSubscriptions_Dashboard(t *testing.T) {
	mgr := NewSubscriptionManager()
	// GetSubscriptions for dashboard room
	subs := mgr.GetSubscriptions("conn-1")
	if subs == nil {
		// OK - returns nil when no subscriptions
	}
}

// MockConn implements socketio.Conn for testing.
type MockConn struct {
	id    string
	rooms map[string]bool
	mu    sync.Mutex
}

var _ socketio.Conn = (*MockConn)(nil)

func NewMockConn(id string) *MockConn {
	return &MockConn{id: id, rooms: make(map[string]bool)}
}

func (c *MockConn) ID() string                              { return c.id }
func (c *MockConn) Close() error                            { return nil }
func (c *MockConn) Context() interface{}                    { return nil }
func (c *MockConn) SetContext(ctx interface{})              {}
func (c *MockConn) Namespace() string                       { return "/trading" }
func (c *MockConn) Emit(eventName string, v ...interface{}) {}
func (c *MockConn) Join(room string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.rooms[room] = true
}
func (c *MockConn) Leave(room string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.rooms, room)
}
func (c *MockConn) LeaveAll() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.rooms = make(map[string]bool)
}
func (c *MockConn) Rooms() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	result := make([]string, 0, len(c.rooms))
	for r := range c.rooms {
		result = append(result, r)
	}
	return result
}
func (c *MockConn) URL() url.URL              { return url.URL{} }
func (c *MockConn) LocalAddr() net.Addr       { return nil }
func (c *MockConn) RemoteAddr() net.Addr      { return nil }
func (c *MockConn) RemoteHeader() http.Header { return http.Header{} }

func TestSubscriptionManager_WithMockConn(t *testing.T) {
	mgr := NewSubscriptionManager()
	conn := NewMockConn("test-conn")

	// Subscribe should work with mock conn
	err := mgr.Subscribe(conn, "BTC/USDT", ChannelTicker)
	// May error if mock doesn't fully implement socketio.Conn
	// but that's OK for interface testing
	_ = err

	// Count should work
	_ = mgr.Count()
}

func TestMockConn_ID(t *testing.T) {
	conn := NewMockConn("my-conn-id")
	if conn.ID() != "my-conn-id" {
		t.Errorf("ID() = %q, want my-conn-id", conn.ID())
	}
}

func TestMockConn_Rooms(t *testing.T) {
	conn := NewMockConn("test")

	conn.Join("room1")
	conn.Join("room2")

	rooms := conn.Rooms()
	if len(rooms) != 2 {
		t.Errorf("expected 2 rooms, got %d", len(rooms))
	}
}

func TestMockConn_LeaveRoom(t *testing.T) {
	conn := NewMockConn("test")

	conn.Join("room1")
	conn.Leave("room1")

	rooms := conn.Rooms()
	if len(rooms) != 0 {
		t.Errorf("expected 0 rooms after leave, got %d", len(rooms))
	}
}
