package ticker

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	DefaultChannel = "trading:external:ticker"
)

type TickerHandler interface {
	OnTicker(ctx context.Context, ticker *TickerData)
}

type TickerData struct {
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

type RedisSubscriber struct {
	redis   *redis.Client
	channel string
	handler TickerHandler
	logger  *slog.Logger
	done    chan struct{}
}

func NewRedisSubscriber(redisClient *redis.Client, channel string, handler TickerHandler, logger *slog.Logger) *RedisSubscriber {
	if channel == "" {
		channel = DefaultChannel
	}
	return &RedisSubscriber{
		redis:   redisClient,
		channel: channel,
		handler: handler,
		logger:  logger,
		done:    make(chan struct{}),
	}
}

func (s *RedisSubscriber) Start(ctx context.Context) {
	if s.redis == nil {
		s.logger.Error("redis_subscriber.start_failed", "error", "redis client is nil")
		return
	}

	if s.handler == nil {
		s.logger.Error("redis_subscriber.start_failed", "error", "handler is nil")
		return
	}

	s.logger.Info("redis_subscriber.starting", "channel", s.channel)

	pubsub := s.redis.Subscribe(ctx, s.channel)
	defer pubsub.Close()

	ch := pubsub.Channel()
	if ch == nil {
		s.logger.Error("redis_subscriber.start_failed", "error", "failed to create channel")
		return
	}

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("redis_subscriber.stopped", "reason", "context cancelled")
			return
		case <-s.done:
			s.logger.Info("redis_subscriber.stopped", "reason", "done signal")
			return
		case msg, ok := <-ch:
			if !ok {
				s.logger.Warn("redis_subscriber.channel_closed")
				return
			}
			s.processMessage(ctx, msg)
		}
	}
}

func (s *RedisSubscriber) processMessage(ctx context.Context, msg *redis.Message) {
	if msg == nil || msg.Payload == "" {
		return
	}

	var ticker TickerData
	if err := json.Unmarshal([]byte(msg.Payload), &ticker); err != nil {
		s.logger.Warn("redis_subscriber.parse_failed",
			"error", err.Error(),
			"payload", msg.Payload,
		)
		return
	}

	if ticker.PairID == "" {
		s.logger.Debug("redis_subscriber.skipping_empty_pair")
		return
	}

	s.logger.Debug("redis_subscriber.ticker_received",
		"pair_id", ticker.PairID,
		"symbol", ticker.Symbol,
	)

	s.handler.OnTicker(ctx, &ticker)
}

func (s *RedisSubscriber) Stop() {
	select {
	case <-s.done:
		return
	default:
		close(s.done)
	}
}

func (s *RedisSubscriber) IsSubscribed(ctx context.Context) bool {
	if s.redis == nil {
		return false
	}

	result, err := s.redis.PubSubChannels(ctx, s.channel).Result()
	if err != nil {
		s.logger.Warn("redis_subscriber.check_failed", "error", err.Error())
		return false
	}

	return len(result) > 0
}

func (s *RedisSubscriber) GetChannel() string {
	return s.channel
}

func (s *RedisSubscriber) HealthCheck(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if s.redis == nil {
		return ErrRedisClientNil
	}

	return s.redis.Ping(ctx).Err()
}

var ErrRedisClientNil = &RedisSubscriberError{message: "redis client is nil"}

type RedisSubscriberError struct {
	message string
}

func (e *RedisSubscriberError) Error() string {
	return e.message
}
