package socketio

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"

	socketio "github.com/googollee/go-socket.io"
	"github.com/kryptos/go-services/public-ws-gateway/internal/adapter/socketio/handlers"
)

const (
	NamespaceTrading = "/trading"
	RoomDashboard    = "dashboard"
	TickerChannel    = "ticker"
)

type TickerMessage struct {
	PairID           string `json:"pair_id"`
	Symbol           string `json:"symbol"`
	LastPrice        string `json:"last_price"`
	Bid              string `json:"bid"`
	Ask              string `json:"ask"`
	Volume24h        string `json:"volume_24h"`
	Volume24hUsd     string `json:"volume_24h_usd"`
	Change24h        string `json:"change_24h"`
	ChangePercent24h string `json:"change_percent_24h"`
	High24h          string `json:"high_24h"`
	Low24h           string `json:"low_24h"`
	Open24h          string `json:"open_24h"`
	Timestamp        string `json:"timestamp"`
}

type Server struct {
	srv    *socketio.Server
	logger *slog.Logger
	mu     sync.RWMutex
	subMgr *handlers.SubscriptionManager

	tradingConns atomic.Int64

	tickerCh chan *TickerMessage
	done     chan struct{}
	wg       sync.WaitGroup
}

func NewServer(logger *slog.Logger) (*Server, error) {
	if logger == nil {
		return nil, errors.New("logger is required")
	}

	srv := socketio.NewServer(nil)

	s := &Server{
		srv:      srv,
		logger:   logger,
		subMgr:   handlers.NewSubscriptionManager(),
		tickerCh: make(chan *TickerMessage, 1000),
		done:     make(chan struct{}),
	}

	if err := s.setupHandlers(); err != nil {
		return nil, err
	}

	return s, nil
}

func (s *Server) setupHandlers() error {
	s.srv.OnConnect(NamespaceTrading, s.onConnect)
	s.srv.OnDisconnect(NamespaceTrading, s.onDisconnect)
	s.srv.OnEvent(NamespaceTrading, "auth", s.onAuth)
	s.srv.OnEvent(NamespaceTrading, "subscribe", s.onSubscribe)
	s.srv.OnEvent(NamespaceTrading, "unsubscribe", s.onUnsubscribe)
	s.srv.OnEvent(NamespaceTrading, "join_dashboard", s.onJoinDashboard)
	s.srv.OnEvent(NamespaceTrading, "leave_dashboard", s.onLeaveDashboard)
	s.srv.OnEvent(NamespaceTrading, "pong", s.onPong)

	return nil
}

func (s *Server) onConnect(conn socketio.Conn) error {
	s.logger.Info("socketio.connect",
		"namespace", conn.Namespace(),
		"conn_id", conn.ID(),
		"remote_addr", conn.RemoteAddr().String(),
	)
	s.tradingConns.Add(1)

	initialState := handlers.BuildWorkspaceState(s.subMgr, conn.ID())
	handlers.EmitWorkspaceRestored(conn, initialState)
	return nil
}

func (s *Server) onDisconnect(conn socketio.Conn, msg string) {
	s.logger.Info("socketio.disconnect",
		"namespace", conn.Namespace(),
		"conn_id", conn.ID(),
		"reason", msg,
	)
	s.subMgr.RemoveConnection(conn.ID())
	s.tradingConns.Add(-1)
}

func (s *Server) onAuth(conn socketio.Conn, args map[string]any) {
	token, ok := args["token"].(string)
	if !ok || token == "" {
		resp := handlers.BuildAuthResponse(false, "", "", "Missing token")
		conn.Emit(handlers.EventAuthResponse, resp)
		return
	}

	payload, err := handlers.ValidateAndParseJWT(token)
	if err != nil {
		s.logger.Warn("socketio.auth_failed",
			"conn_id", conn.ID(),
			"error", err.Error(),
		)
		resp := handlers.BuildAuthResponse(false, "", "", "Invalid token")
		conn.Emit(handlers.EventAuthResponse, resp)
		return
	}

	userID := handlers.GetUserID(payload)
	role := payload.Role

	conn.SetContext(userID)

	s.logger.Info("socketio.auth_success",
		"conn_id", conn.ID(),
		"user_id", userID,
		"role", role,
	)

	resp := handlers.BuildAuthResponse(true, userID, role, "")
	conn.Emit(handlers.EventAuthResponse, resp)
}

func (s *Server) onSubscribe(conn socketio.Conn, args map[string]any) {
	pairID, ok := args["pair_id"].(string)
	if !ok || pairID == "" {
		resp := handlers.BuildErrorEvent(
			handlers.ErrCodeInvalidParams,
			"Missing or invalid pair_id",
			nil,
		)
		conn.Emit(handlers.EventError, resp)
		return
	}

	channelsArg := args["channels"]
	var channels []string

	switch v := channelsArg.(type) {
	case []any:
		for _, ch := range v {
			if chStr, ok := ch.(string); ok {
				channels = append(channels, chStr)
			}
		}
	case []string:
		channels = v
	case string:
		channels = []string{v}
	default:
		channels = []string{handlers.ChannelTicker}
	}

	if len(channels) == 0 {
		channels = []string{handlers.ChannelTicker}
	}

	var subscribed []string
	for _, channel := range channels {
		if err := s.subMgr.Subscribe(conn, pairID, channel); err != nil {
			s.logger.Warn("socketio.subscribe_failed",
				"conn_id", conn.ID(),
				"pair_id", pairID,
				"channel", channel,
				"error", err.Error(),
			)
			continue
		}
		subscribed = append(subscribed, channel)
		s.logger.Debug("socketio.subscribed",
			"conn_id", conn.ID(),
			"pair_id", pairID,
			"channel", channel,
		)
	}

	if len(subscribed) > 0 {
		resp := handlers.BuildSubscribedEvent(pairID, subscribed)
		conn.Emit(handlers.EventSubscribed, resp)
	}
}

func (s *Server) onUnsubscribe(conn socketio.Conn, args map[string]any) {
	pairID, ok := args["pair_id"].(string)
	if !ok || pairID == "" {
		resp := handlers.BuildErrorEvent(
			handlers.ErrCodeInvalidParams,
			"Missing or invalid pair_id",
			nil,
		)
		conn.Emit(handlers.EventError, resp)
		return
	}

	channelsArg := args["channels"]
	var channels []string

	switch v := channelsArg.(type) {
	case []any:
		for _, ch := range v {
			if chStr, ok := ch.(string); ok {
				channels = append(channels, chStr)
			}
		}
	case []string:
		channels = v
	case string:
		channels = []string{v}
	default:
		channels = []string{handlers.ChannelTicker}
	}

	if len(channels) == 0 {
		channels = []string{handlers.ChannelTicker}
	}

	var unsubscribed []string
	for _, channel := range channels {
		if err := s.subMgr.Unsubscribe(conn, pairID, channel); err != nil {
			s.logger.Warn("socketio.unsubscribe_failed",
				"conn_id", conn.ID(),
				"pair_id", pairID,
				"channel", channel,
				"error", err.Error(),
			)
			continue
		}
		unsubscribed = append(unsubscribed, channel)
		s.logger.Debug("socketio.unsubscribed",
			"conn_id", conn.ID(),
			"pair_id", pairID,
			"channel", channel,
		)
	}

	if len(unsubscribed) > 0 {
		resp := handlers.BuildUnsubscribedEvent(pairID, unsubscribed)
		conn.Emit(handlers.EventUnsubscribed, resp)
	}
}

func (s *Server) onJoinDashboard(conn socketio.Conn, _ map[string]any) {
	if err := s.subMgr.JoinDashboard(conn); err != nil {
		s.logger.Warn("socketio.join_dashboard_failed",
			"conn_id", conn.ID(),
			"error", err.Error(),
		)
		return
	}

	resp := handlers.BuildDashboardJoinedEvent()
	conn.Emit(handlers.EventDashboardJoined, resp)

	s.logger.Info("socketio.dashboard_joined",
		"conn_id", conn.ID(),
	)
}

func (s *Server) onLeaveDashboard(conn socketio.Conn, _ map[string]any) {
	if err := s.subMgr.LeaveDashboard(conn); err != nil {
		s.logger.Warn("socketio.leave_dashboard_failed",
			"conn_id", conn.ID(),
			"error", err.Error(),
		)
		return
	}

	resp := handlers.BuildDashboardLeftEvent()
	conn.Emit(handlers.EventDashboardLeft, resp)

	s.logger.Info("socketio.dashboard_left",
		"conn_id", conn.ID(),
	)
}

func (s *Server) onPong(conn socketio.Conn, _ map[string]any) {
}

func (s *Server) Start(ctx context.Context) error {
	s.wg.Add(1)
	go s.broadcastTickerLoop(ctx)

	s.logger.Info("socketio.server_started")
	return nil
}

func (s *Server) Stop() error {
	close(s.done)
	s.wg.Wait()

	s.srv.Close()
	s.logger.Info("socketio.server_stopped")
	return nil
}

func (s *Server) BroadcastTicker(msg *TickerMessage) {
	if msg == nil {
		return
	}

	select {
	case s.tickerCh <- msg:
	default:
		s.logger.Warn("socketio.ticker_channel_full",
			"pair_id", msg.PairID,
		)
	}
}

func (s *Server) broadcastTickerLoop(ctx context.Context) {
	defer s.wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.done:
			return
		case msg := <-s.tickerCh:
			s.emitTicker(msg)
		}
	}
}

func (s *Server) emitTicker(msg *TickerMessage) {
	room := msg.PairID + ":" + TickerChannel

	payload := map[string]any{
		"event": "ticker",
		"data":  msg,
	}

	s.srv.BroadcastToRoom(NamespaceTrading, room, "ticker", payload)
}

func (s *Server) emitToDashboard(event string, data any) {
	payload := map[string]any{
		"event": event,
		"data":  data,
	}

	s.srv.BroadcastToRoom(NamespaceTrading, RoomDashboard, "ticker", payload)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.srv.ServeHTTP(w, r)
}

func (s *Server) ConnectionCount() int64 {
	return s.tradingConns.Load()
}

func (s *Server) SubscriptionCount() int {
	return s.subMgr.Count()
}

func (s *Server) GetTickerChannel() chan<- *TickerMessage {
	return s.tickerCh
}

func (s *Server) TickerDataFromJSON(data []byte) (*TickerMessage, error) {
	var msg TickerMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}
