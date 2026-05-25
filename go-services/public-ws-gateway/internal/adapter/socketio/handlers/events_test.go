package handlers

import (
	"testing"
)

func TestBuildAuthResponse_Success(t *testing.T) {
	resp := BuildAuthResponse(true, "user-123", "trader", "")

	if resp["success"] != true {
		t.Error("expected success=true")
	}
	if resp["user_id"] != "user-123" {
		t.Errorf("expected user_id=user-123, got %v", resp["user_id"])
	}
	if resp["role"] != "trader" {
		t.Errorf("expected role=trader, got %v", resp["role"])
	}
	if _, exists := resp["error"]; exists {
		t.Error("expected no error field for success response")
	}
}

func TestBuildAuthResponse_Failure(t *testing.T) {
	resp := BuildAuthResponse(false, "", "", "invalid token")

	if resp["success"] != false {
		t.Error("expected success=false")
	}
	if resp["error"] != "invalid token" {
		t.Errorf("expected error='invalid token', got %v", resp["error"])
	}
	if _, exists := resp["user_id"]; exists {
		t.Error("expected no user_id field for failure response")
	}
}

func TestBuildSubscribedEvent(t *testing.T) {
	channels := []string{"ticker", "ohlc"}
	resp := BuildSubscribedEvent("BTC/USDT", channels)

	if resp["event"] != "subscribed" {
		t.Errorf("expected event=subscribed, got %v", resp["event"])
	}
	if resp["pair_id"] != "BTC/USDT" {
		t.Errorf("expected pair_id=BTC/USDT, got %v", resp["pair_id"])
	}
	gotChannels, ok := resp["channels"].([]string)
	if !ok {
		t.Fatal("expected channels to be []string")
	}
	if len(gotChannels) != 2 || gotChannels[0] != "ticker" {
		t.Errorf("unexpected channels: %v", gotChannels)
	}
}

func TestBuildUnsubscribedEvent(t *testing.T) {
	channels := []string{"ticker"}
	resp := BuildUnsubscribedEvent("ETH/USDT", channels)

	if resp["event"] != "unsubscribed" {
		t.Errorf("expected event=unsubscribed, got %v", resp["event"])
	}
	if resp["pair_id"] != "ETH/USDT" {
		t.Errorf("expected pair_id=ETH/USDT, got %v", resp["pair_id"])
	}
}

func TestBuildErrorEvent(t *testing.T) {
	details := map[string]any{"field": "token", "reason": "expired"}
	resp := BuildErrorEvent(ErrCodeTokenExpired, "Token expired", details)

	if resp["code"] != ErrCodeTokenExpired {
		t.Errorf("expected code=%s, got %v", ErrCodeTokenExpired, resp["code"])
	}
	if resp["message"] != "Token expired" {
		t.Errorf("expected message='Token expired', got %v", resp["message"])
	}
	if resp["field"] != "token" {
		t.Errorf("expected field=token, got %v", resp["field"])
	}
	if resp["reason"] != "expired" {
		t.Errorf("expected reason=expired, got %v", resp["reason"])
	}
}

func TestBuildErrorEvent_NoDetails(t *testing.T) {
	resp := BuildErrorEvent(ErrCodeServerError, "Internal server error", nil)

	if resp["code"] != ErrCodeServerError {
		t.Errorf("expected code=%s, got %v", ErrCodeServerError, resp["code"])
	}
	if resp["message"] != "Internal server error" {
		t.Errorf("expected message='Internal server error', got %v", resp["message"])
	}
}

func TestBuildDashboardJoinedEvent(t *testing.T) {
	resp := BuildDashboardJoinedEvent()
	if resp["event"] != "dashboard_joined" {
		t.Errorf("expected event=dashboard_joined, got %v", resp["event"])
	}
}

func TestBuildDashboardLeftEvent(t *testing.T) {
	resp := BuildDashboardLeftEvent()
	if resp["event"] != "dashboard_left" {
		t.Errorf("expected event=dashboard_left, got %v", resp["event"])
	}
}

func TestErrorCodes(t *testing.T) {
	if ErrCodeAuthFailed != "AUTH_FAILED" {
		t.Errorf("unexpected ErrCodeAuthFailed: %s", ErrCodeAuthFailed)
	}
	if ErrCodeInvalidToken != "INVALID_TOKEN" {
		t.Errorf("unexpected ErrCodeInvalidToken: %s", ErrCodeInvalidToken)
	}
	if ErrCodeTokenExpired != "TOKEN_EXPIRED" {
		t.Errorf("unexpected ErrCodeTokenExpired: %s", ErrCodeTokenExpired)
	}
	if ErrCodeInvalidParams != "INVALID_PARAMS" {
		t.Errorf("unexpected ErrCodeInvalidParams: %s", ErrCodeInvalidParams)
	}
	if ErrCodeServerError != "SERVER_ERROR" {
		t.Errorf("unexpected ErrCodeServerError: %s", ErrCodeServerError)
	}
	if ErrCodeNotAuthorized != "NOT_AUTHORIZED" {
		t.Errorf("unexpected ErrCodeNotAuthorized: %s", ErrCodeNotAuthorized)
	}
}
