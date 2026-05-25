package handlers

const (
	EventAuthResponse       = "auth_response"
	EventSubscribed         = "subscribed"
	EventUnsubscribed       = "unsubscribed"
	EventError              = "error"
	EventDashboardJoined    = "dashboard_joined"
	EventDashboardLeft      = "dashboard_left"
	EventWorkspaceRestored   = "workspace_restored"
)

const (
	ErrCodeAuthFailed    = "AUTH_FAILED"
	ErrCodeInvalidToken  = "INVALID_TOKEN"
	ErrCodeTokenExpired  = "TOKEN_EXPIRED"
	ErrCodeInvalidParams = "INVALID_PARAMS"
	ErrCodeServerError   = "SERVER_ERROR"
	ErrCodeNotAuthorized = "NOT_AUTHORIZED"
)

func BuildAuthResponse(success bool, userID string, role string, errMsg string) map[string]any {
	resp := map[string]any{
		"success": success,
	}
	if success {
		resp["user_id"] = userID
		resp["role"] = role
	} else {
		resp["error"] = errMsg
	}
	return resp
}

func BuildSubscribedEvent(pairID string, channels []string) map[string]any {
	return map[string]any{
		"event":   "subscribed",
		"pair_id": pairID,
		"channels": channels,
	}
}

func BuildUnsubscribedEvent(pairID string, channels []string) map[string]any {
	return map[string]any{
		"event":   "unsubscribed",
		"pair_id": pairID,
		"channels": channels,
	}
}

func BuildErrorEvent(code string, message string, details map[string]any) map[string]any {
	resp := map[string]any{
		"code":    code,
		"message": message,
	}
	if details != nil {
		for k, v := range details {
			resp[k] = v
		}
	}
	return resp
}

func BuildDashboardJoinedEvent() map[string]any {
	return map[string]any{
		"event": "dashboard_joined",
	}
}

func BuildDashboardLeftEvent() map[string]any {
	return map[string]any{
		"event": "dashboard_left",
	}
}
