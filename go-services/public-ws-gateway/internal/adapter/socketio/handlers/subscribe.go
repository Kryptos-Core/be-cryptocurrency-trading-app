package handlers

import (
	"errors"
	"sync"

	socketio "github.com/googollee/go-socket.io"
)

var (
	ErrInvalidPairID     = errors.New("invalid pair ID")
	ErrInvalidChannel    = errors.New("invalid channel")
	ErrAlreadySubscribed = errors.New("already subscribed to this channel")
)

const (
	ChannelTicker    = "ticker"
	ChannelOrderbook = "orderbook"
	ChannelTrades    = "trades"
	ChannelDashboard = "dashboard"
)

type SubscriptionManager struct {
	mu            sync.RWMutex
	subscriptions map[string]map[string]bool
}

func NewSubscriptionManager() *SubscriptionManager {
	return &SubscriptionManager{
		subscriptions: make(map[string]map[string]bool),
	}
}

func (sm *SubscriptionManager) Subscribe(conn socketio.Conn, pairID, channel string) error {
	if pairID == "" {
		return ErrInvalidPairID
	}
	if !isValidChannel(channel) {
		return ErrInvalidChannel
	}

	room := buildRoom(pairID, channel)

	sm.mu.Lock()
	defer sm.mu.Unlock()

	connID := conn.ID()
	if sm.subscriptions[connID] == nil {
		sm.subscriptions[connID] = make(map[string]bool)
	}

	if sm.subscriptions[connID][room] {
		return ErrAlreadySubscribed
	}

	sm.subscriptions[connID][room] = true

	return nil
}

func (sm *SubscriptionManager) Unsubscribe(conn socketio.Conn, pairID, channel string) error {
	if pairID == "" {
		return ErrInvalidPairID
	}
	if !isValidChannel(channel) {
		return ErrInvalidChannel
	}

	room := buildRoom(pairID, channel)

	sm.mu.Lock()
	defer sm.mu.Unlock()

	connID := conn.ID()
	if sm.subscriptions[connID] == nil {
		return nil
	}

	if sm.subscriptions[connID][room] {
		delete(sm.subscriptions[connID], room)
	}

	return nil
}

func (sm *SubscriptionManager) JoinDashboard(conn socketio.Conn) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	connID := conn.ID()
	if sm.subscriptions[connID] == nil {
		sm.subscriptions[connID] = make(map[string]bool)
	}

	room := ChannelDashboard
	if sm.subscriptions[connID][room] {
		return ErrAlreadySubscribed
	}

	sm.subscriptions[connID][room] = true

	return nil
}

func (sm *SubscriptionManager) LeaveDashboard(conn socketio.Conn) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	connID := conn.ID()
	if sm.subscriptions[connID] == nil {
		return nil
	}

	room := ChannelDashboard
	if sm.subscriptions[connID][room] {
		delete(sm.subscriptions[connID], room)
	}

	return nil
}

func (sm *SubscriptionManager) GetSubscribedPairs(connID string) []string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	pairs := make([]string, 0, 4)
	seenPairs := make(map[string]bool)
	if connSubs, ok := sm.subscriptions[connID]; ok {
		for room := range connSubs {
			if pairID, channel := parseRoom(room); channel == ChannelTicker {
				if !seenPairs[pairID] {
					seenPairs[pairID] = true
					pairs = append(pairs, pairID)
				}
			}
		}
	}

	return pairs
}

func (sm *SubscriptionManager) GetSubscriptions(connID string) []Subscription {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	var subs []Subscription
	seenPairs := make(map[string]map[string]bool)

	if connSubs, ok := sm.subscriptions[connID]; ok {
		for room := range connSubs {
			if pairID, channel := parseRoom(room); channel != "" {
				if seenPairs[pairID] == nil {
					seenPairs[pairID] = make(map[string]bool)
				}
				seenPairs[pairID][channel] = true
			}
		}
	}

	for pairID, channels := range seenPairs {
		var chList []string
		for ch := range channels {
			chList = append(chList, ch)
		}
		subs = append(subs, Subscription{
			PairID:   pairID,
			Channels: chList,
		})
	}

	return subs
}

func (sm *SubscriptionManager) RemoveConnection(connID string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.subscriptions, connID)
}

func (sm *SubscriptionManager) Count() int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return len(sm.subscriptions)
}

func buildRoom(pairID, channel string) string {
	return pairID + ":" + channel
}

func parseRoom(room string) (pairID string, channel string) {
	switch room {
	case ChannelDashboard:
		return "", ChannelDashboard
	default:
		if len(room) > 8 && room[len(room)-7:] == ":"+ChannelTicker {
			return room[:len(room)-7], ChannelTicker
		}
		if len(room) > 11 && room[len(room)-10:] == ":"+ChannelOrderbook {
			return room[:len(room)-10], ChannelOrderbook
		}
		if len(room) > 7 && room[len(room)-7:] == ":"+ChannelTrades {
			return room[:len(room)-7], ChannelTrades
		}
		return "", ""
	}
}

func isValidChannel(channel string) bool {
	switch channel {
	case ChannelTicker, ChannelOrderbook, ChannelTrades:
		return true
	default:
		return false
	}
}
