package handlers

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
)

var (
	ErrInvalidToken  = errors.New("invalid token format")
	ErrMalformedToken = errors.New("malformed token")
	ErrTokenExpired  = errors.New("token expired")
	ErrInvalidClaims = errors.New("invalid claims")
)

type JWTPayload struct {
	Sub      string `json:"sub"`
	UserID   string `json:"user_id"`
	Exp      int64  `json:"exp"`
	Iat      int64  `json:"iat"`
	Role     string `json:"role"`
}

func ValidateAndParseJWT(token string) (*JWTPayload, error) {
	if token == "" {
		return nil, ErrInvalidToken
	}

	token = strings.TrimSpace(token)
	if strings.HasPrefix(token, "Bearer ") {
		token = strings.TrimPrefix(token, "Bearer ")
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrInvalidToken
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		payloadBytes, err = base64.StdEncoding.DecodeString(parts[1])
		if err != nil {
			return nil, ErrMalformedToken
		}
	}

	var payload JWTPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, ErrMalformedToken
	}

	if payload.UserID == "" && payload.Sub == "" {
		return nil, ErrInvalidClaims
	}

	return &payload, nil
}

func GetUserID(payload *JWTPayload) string {
	if payload == nil {
		return ""
	}
	if payload.UserID != "" {
		return payload.UserID
	}
	return payload.Sub
}

func HasRole(payload *JWTPayload, role string) bool {
	if payload == nil || role == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(payload.Role), []byte(role)) == 1
}
