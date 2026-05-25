package application

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"os"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/kryptos/go-services/matching-engine/internal/application/canary"
	"github.com/kryptos/go-services/matching-engine/internal/domain"
	"github.com/kryptos/go-services/matching-engine/internal/domain/matching"
	"github.com/kryptos/go-services/matching-engine/internal/domain/orderbook"
	"github.com/kryptos/go-services/matching-engine/internal/infrastructure/persistence"
)

var (
	ErrPairHalted            = errors.New("trading halted for this pair")
	ErrPriceDeviation         = errors.New("price deviation exceeds tolerance")
	ErrInsufficientBalance    = errors.New("insufficient wallet balance")
	ErrInsufficientLiquidity  = errors.New("insufficient liquidity for FOK")
	ErrMutationsDisabled      = errors.New("database mutations are disabled")
	ErrOrderAlreadyFilled     = errors.New("order already filled")
	ErrOrderCancelled         = errors.New("order already cancelled")
)

type CircuitBreaker interface {
	IsHalted(pairID string) bool
}

type Executor struct {
	pool       *pgxpool.Pool
	orderRepo  *persistence.OrderRepository
	tradeRepo  *persistence.Repository
	walletRepo  *persistence.Repository
	shadowRepo *persistence.ShadowRepository
	lockClient *redis.Client
	strategy   *matching.MatchingStrategy
	canary     *canary.CanaryConfig
	logger     *slog.Logger

	instanceID string

	ordersProcessed atomic.Int64
	tradesCreated   atomic.Int64
	errorsCount     atomic.Int64
}

type ExecutorConfig struct {
	Pool      *pgxpool.Pool
	LockClient *redis.Client
	CanaryCSV string
	Logger    *slog.Logger
}

func NewExecutor(cfg ExecutorConfig) *Executor {
	instanceID := os.Getenv("POD_NAME")
	if instanceID == "" {
		instanceID = uuid.New().String()[:8]
	}

	return &Executor{
		pool:       cfg.Pool,
		orderRepo:  persistence.NewOrderRepository(cfg.Pool),
		tradeRepo:  persistence.NewRepository(cfg.Pool),
		walletRepo: persistence.NewRepository(cfg.Pool),
		shadowRepo: persistence.NewShadowRepository(cfg.Pool),
		lockClient: cfg.LockClient,
		strategy:   matching.NewMatchingStrategy(1.0),
		canary:     canary.NewCanaryConfig(cfg.CanaryCSV),
		logger:     cfg.Logger,
		instanceID: instanceID,
	}
}

// ExecuteMatch processes a taker order against the order book.
// Returns the created trades or an error.
// Only executes when MUTATIONS_ENABLED=true, otherwise returns ErrMutationsDisabled.
func (e *Executor) ExecuteMatch(ctx context.Context, taker *domain.Order, book *orderbook.OrderBook) ([]domain.Trade, error) {
	mutationsEnabled := os.Getenv("MUTATIONS_ENABLED")
	if mutationsEnabled != "true" && mutationsEnabled != "1" {
		e.logger.Debug("execute_match.skipped_mutations_disabled",
			"order_id", taker.OrderID,
			"pair_id", taker.PairID,
		)
		return nil, ErrMutationsDisabled
	}

	e.logger.Info("execute_match.starting",
		"order_id", taker.OrderID,
		"pair_id", taker.PairID,
		"side", taker.Side,
		"amount", taker.Amount.String(),
		"instance_id", e.instanceID,
	)

	return e.executeMatchImpl(ctx, taker, book)
}

func (e *Executor) executeMatchImpl(ctx context.Context, taker *domain.Order, book *orderbook.OrderBook) ([]domain.Trade, error) {
	var trades []domain.Trade

	err := persistence.WithTransaction(ctx, e.pool, func(tx pgx.Tx) error {
		makerIDs := e.collectMakerIDs(book)
		allUserIDs := append(makerIDs, taker.UserID)

		quoteCurrency := e.extractQuoteCurrency(taker.PairID)
		baseCurrency := e.extractBaseCurrency(taker.PairID)
		currencyIDs := []string{quoteCurrency, baseCurrency}

		_, err := e.tradeRepo.FetchWalletsByUsers(ctx, tx, allUserIDs, currencyIDs)
		if err != nil {
			return fmt.Errorf("fetch wallets: %w", err)
		}

		makerOrders := e.collectMakerOrders(book)
		orderIDs := make([]string, 0, len(makerOrders)+1)
		for _, mo := range makerOrders {
			orderIDs = append(orderIDs, mo.OrderID)
		}
		orderIDs = append(orderIDs, taker.OrderID)

		if len(orderIDs) > 0 {
			_, err = e.orderRepo.FetchOrdersByIDs(ctx, tx, orderIDs)
			if err != nil {
				return fmt.Errorf("fetch orders: %w", err)
			}
		}

		matchingTrades, _, err := e.strategy.Match(taker, book)
		if err != nil {
			return fmt.Errorf("matching: %w", err)
		}

		for i := range matchingTrades {
			trade := &matchingTrades[i]
			trade.CreatedAt = time.Now().UTC()

			tradeRecord := e.tradeToRecord(trade)
			if err := e.tradeRepo.InsertTrade(ctx, tx, tradeRecord); err != nil {
				return fmt.Errorf("insert trade: %w", err)
			}

			if err := e.updateOrderAfterTrade(ctx, tx, taker, trade); err != nil {
				return fmt.Errorf("update taker order: %w", err)
			}

			for _, mo := range makerOrders {
				if mo.OrderID == trade.MakerOID {
					if err := e.updateOrderAfterTrade(ctx, tx, mo, trade); err != nil {
						return fmt.Errorf("update maker order %s: %w", mo.OrderID, err)
					}
					break
				}
			}

			ledgerEntries := e.createLedgerEntries(trade, taker, makerOrders)
			for _, entry := range ledgerEntries {
				if err := e.tradeRepo.InsertWalletLedger(ctx, tx, entry); err != nil {
					return fmt.Errorf("insert ledger: %w", err)
				}
			}

			if err := e.insertTradeEventOutbox(ctx, tx, trade); err != nil {
				return fmt.Errorf("insert outbox: %w", err)
			}
		}

		trades = matchingTrades
		return nil
	})

	if err != nil {
		e.errorsCount.Add(1)
		e.logger.Error("execute_match.failed",
			"order_id", taker.OrderID,
			"pair_id", taker.PairID,
			"error", err.Error(),
		)
		return nil, err
	}

	e.ordersProcessed.Add(1)
	e.tradesCreated.Add(int64(len(trades)))

	e.logger.Info("execute_match.completed",
		"order_id", taker.OrderID,
		"pair_id", taker.PairID,
		"trades_count", len(trades),
	)

	return trades, nil
}

func (e *Executor) collectMakerIDs(book *orderbook.OrderBook) []string {
	makerMap := make(map[string]struct{})
	for _, order := range book.GetBuyOrders() {
		makerMap[order.UserID] = struct{}{}
	}
	for _, order := range book.GetSellOrders() {
		makerMap[order.UserID] = struct{}{}
	}

	result := make([]string, 0, len(makerMap))
	for id := range makerMap {
		result = append(result, id)
	}
	return result
}

func (e *Executor) collectMakerOrders(book *orderbook.OrderBook) []*domain.Order {
	var makers []*domain.Order
	makers = append(makers, book.GetBuyOrders()...)
	makers = append(makers, book.GetSellOrders()...)
	return makers
}

func (e *Executor) extractQuoteCurrency(pairID string) string {
	parts := splitPair(pairID)
	if len(parts) >= 2 {
		return parts[1]
	}
	return "USDT"
}

func (e *Executor) extractBaseCurrency(pairID string) string {
	parts := splitPair(pairID)
	if len(parts) >= 1 {
		return parts[0]
	}
	return "BTC"
}

func splitPair(pairID string) []string {
	for i := 0; i < len(pairID); i++ {
		if pairID[i] == '/' {
			return []string{pairID[:i], pairID[i+1:]}
		}
	}
	if len(pairID) >= 3 {
		return []string{pairID[:len(pairID)-4], pairID[len(pairID)-4:]}
	}
	return []string{pairID}
}

func (e *Executor) tradeToRecord(trade *domain.Trade) *persistence.Trade {
	return &persistence.Trade{
		TradeID:      trade.TradeID,
		PairID:       trade.PairID,
		TakerOrderID: trade.TakerOID,
		MakerOrderID: trade.MakerOID,
		Price:        trade.Price.String(),
		Amount:       trade.Amount.String(),
		TakerFee:     trade.TakerFee.String(),
		MakerFee:     trade.MakerFee.String(),
		FeeCurrencyID: "USDT",
		CreatedAt:    trade.CreatedAt,
	}
}

func (e *Executor) updateOrderAfterTrade(ctx context.Context, tx pgx.Tx, order *domain.Order, trade *domain.Trade) error {
	var filledAmount string
	var status string

	if order.OrderID == trade.TakerOID {
		filledAmount = order.FilledAmount.String()
		if order.IsFilled() {
			status = string(domain.StatusFilled)
		} else {
			status = string(domain.StatusPartial)
		}
	} else {
		filledAmount = order.FilledAmount.String()
		if order.IsFilled() {
			status = string(domain.StatusFilled)
		} else {
			status = string(domain.StatusPartial)
		}
	}

	return e.orderRepo.UpdateOrderFill(ctx, tx, order.OrderID, filledAmount, "", status)
}

func (e *Executor) createLedgerEntries(trade *domain.Trade, taker *domain.Order, makers []*domain.Order) []*persistence.WalletLedger {
	entries := make([]*persistence.WalletLedger, 0, 4)

	price := &trade.Price
	amount := &trade.Amount
	takerFee := &trade.TakerFee
	makerFee := &trade.MakerFee

	quoteCurrency := "USDT"
	baseCurrency := "BTC"

	tradeQuote := new(big.Int).Mul(price, amount)
	_ = new(big.Int).Sub(tradeQuote, makerFee)
	takerReceives := new(big.Int).Sub(amount, takerFee)

	entries = append(entries, &persistence.WalletLedger{
		LedgerID:     uuid.New().String(),
		UserID:       trade.MakerID,
		CurrencyID:   baseCurrency,
		WalletID:     fmt.Sprintf("wallet_%s_%s", trade.MakerID, baseCurrency),
		RefType:      "TRADE",
		RefID:        trade.TradeID,
		Direction:    "CREDIT",
		Amount:       amount.String(),
		BalanceAfter: "0",
	})

	entries = append(entries, &persistence.WalletLedger{
		LedgerID:     uuid.New().String(),
		UserID:       trade.MakerID,
		CurrencyID:   quoteCurrency,
		WalletID:     fmt.Sprintf("wallet_%s_%s", trade.MakerID, quoteCurrency),
		RefType:      "TRADE",
		RefID:        trade.TradeID,
		Direction:    "DEBIT",
		Amount:       tradeQuote.String(),
		BalanceAfter: "0",
	})

	entries = append(entries, &persistence.WalletLedger{
		LedgerID:     uuid.New().String(),
		UserID:       trade.TakerID,
		CurrencyID:   quoteCurrency,
		WalletID:     fmt.Sprintf("wallet_%s_%s", trade.TakerID, quoteCurrency),
		RefType:      "TRADE",
		RefID:        trade.TradeID,
		Direction:    "CREDIT",
		Amount:       takerReceives.String(),
		BalanceAfter: "0",
	})

	entries = append(entries, &persistence.WalletLedger{
		LedgerID:     uuid.New().String(),
		UserID:       trade.TakerID,
		CurrencyID:   baseCurrency,
		WalletID:     fmt.Sprintf("wallet_%s_%s", trade.TakerID, baseCurrency),
		RefType:      "TRADE",
		RefID:        trade.TradeID,
		Direction:    "DEBIT",
		Amount:       amount.String(),
		BalanceAfter: "0",
	})

	_ = taker
	_ = makers

	return entries
}

func (e *Executor) insertTradeEventOutbox(ctx context.Context, tx pgx.Tx, trade *domain.Trade) error {
	eventPayload := map[string]any{
		"trade_id":    trade.TradeID,
		"pair_id":     trade.PairID,
		"maker_id":    trade.MakerID,
		"taker_id":    trade.TakerID,
		"maker_order": trade.MakerOID,
		"taker_order": trade.TakerOID,
		"price":       trade.Price.String(),
		"amount":      trade.Amount.String(),
		"maker_fee":   trade.MakerFee.String(),
		"taker_fee":   trade.TakerFee.String(),
		"created_at":  trade.CreatedAt.Format(time.RFC3339),
	}

	payloadJSON, err := json.Marshal(eventPayload)
	if err != nil {
		return fmt.Errorf("marshal event payload: %w", err)
	}

	outboxEntry := &persistence.IntegrationOutbox{
		ID:            uuid.New().String(),
		AggregateType: "trade",
		AggregateID:   trade.TradeID,
		EventType:     "trade.executed",
		Payload:       string(payloadJSON),
		OccurredAt:    trade.CreatedAt,
		DedupeKey:     fmt.Sprintf("trade.executed.%s", trade.TradeID),
		KafkaTopic:    "crypto-trading.tradeexecuted",
	}

	return e.tradeRepo.InsertOutbox(ctx, tx, outboxEntry)
}

// InsertShadowRun inserts a shadow matching run record.
func (e *Executor) InsertShadowRun(ctx context.Context, runID, pairID, orderID, mode, status string, payload []byte) error {
	return e.shadowRepo.Insert(ctx, runID, pairID, orderID, mode, status, payload)
}

// GetMetrics returns executor metrics.
func (e *Executor) GetMetrics() ExecutorMetrics {
	return ExecutorMetrics{
		OrdersProcessed: e.ordersProcessed.Load(),
		TradesCreated:  e.tradesCreated.Load(),
		ErrorsCount:    e.errorsCount.Load(),
	}
}

type ExecutorMetrics struct {
	OrdersProcessed int64 `json:"orders_processed_total"`
	TradesCreated  int64 `json:"trades_created_total"`
	ErrorsCount    int64 `json:"errors_total"`
}

// MetricsToPrometheus returns metrics in Prometheus text format.
func (e *Executor) MetricsToPrometheus() string {
	m := e.GetMetrics()
	return fmt.Sprintf(`# HELP matching_orders_processed_total Total orders processed.
# TYPE matching_orders_processed_total counter
matching_orders_processed_total %d
# HELP matching_trades_created_total Total trades created.
# TYPE matching_trades_created_total counter
matching_trades_created_total %d
# HELP matching_errors_total Total errors.
# TYPE matching_errors_total counter
matching_errors_total %d
`, m.OrdersProcessed, m.TradesCreated, m.ErrorsCount)
}
