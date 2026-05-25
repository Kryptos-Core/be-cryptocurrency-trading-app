package handlers

import (
	"encoding/json"

	socketio "github.com/googollee/go-socket.io"
)

type WorkspaceState struct {
	Subscriptions   []Subscription `json:"subscriptions"`
	DashboardJoined bool            `json:"dashboard_joined"`
}

type Subscription struct {
	PairID   string   `json:"pair_id"`
	Channels []string `json:"channels"`
}

func EmitWorkspaceRestored(conn socketio.Conn, state *WorkspaceState) {
	if state == nil || conn == nil {
		return
	}

	data, err := json.Marshal(state)
	if err != nil {
		return
	}

	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		return
	}

	conn.Emit("workspace_restored", parsed)
}

func BuildWorkspaceState(subsManager *SubscriptionManager, connID string) *WorkspaceState {
	if subsManager == nil {
		return &WorkspaceState{}
	}

	subscriptions := subsManager.GetSubscriptions(connID)

	return &WorkspaceState{
		Subscriptions:   subscriptions,
		DashboardJoined: isDashboardJoined(subsManager, connID),
	}
}

func isDashboardJoined(subsManager *SubscriptionManager, connID string) bool {
	subs := subsManager.GetSubscriptions(connID)
	for _, sub := range subs {
		if sub.PairID == "" {
			for _, ch := range sub.Channels {
				if ch == ChannelDashboard {
					return true
				}
			}
		}
	}
	return false
}
