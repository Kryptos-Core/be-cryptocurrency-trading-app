package application

import (
	"context"
	"fmt"
	"log/slog"
	"math/big"
	"sync/atomic"

	"github.com/google/uuid"
	"github.com/kryptos/go-services/matching-engine/internal/domain"
	"github.com/kryptos/go-services/matching-engine/internal/domain/shadow"
	"github.com/kryptos/go-services/matching-engine/internal/infrastructure/lock"
	"github.com/kryptos/go-services/matching-engine/internal/infrastructure/persistence"
)

// LockClient defines the interface for acquiring and releasing distributed locks.
type LockClient interface {
	Acquire(ctx context.Context) error
	Release(ctx context.Context) error
}

// ShadowEngine runs the matching algorithm in shadow mode (no DB mutations).
type ShadowEngine struct {
	shadowRepo *persistence.ShadowRepository
	lockClient LockClient
	logger     *slog.Logger

	// Metrics
	shadowProcessed atomic.Int64
	shadowMatched  atomic.Int64
	shadowSkipped  atomic.Int64
	shadowErrors   atomic.Int64
}

// ShadowJobData contains the data needed to process a shadow order.
type ShadowJobData struct {
	TakerOrder    *domain.Order `json:"taker_order"`
	PairID        string        `json:"pair_id"`
	FeeCurrencyID string        `json:"fee_currency_id"`
	MakerFeeRate  string        `json:"maker_fee_rate"`
	TakerFeeRate  string        `json:"taker_fee_rate"`
}

// ShadowMetrics holds shadow engine metrics.
type ShadowMetrics struct {
	Processed int64 `json:"shadow_processed_total"`
	Matched   int64 `json:"shadow_matched_total"`
	Skipped   int64 `json:"shadow_skipped_total"`
	Errors    int64 `json:"shadow_errors_total"`
}

// NewShadowEngine creates a new ShadowEngine.
func NewShadowEngine(
	shadowRepo *persistence.ShadowRepository,
	lockClient LockClient,
	logger *slog.Logger,
) *ShadowEngine {
	return &ShadowEngine{
		shadowRepo: shadowRepo,
		lockClient: lockClient,
		logger:     logger,
	}
}

// ProcessShadowOrder runs the matching algorithm in shadow mode.
// 1. Acquire lock for pair
// 2. Load order book from DB (read-only) - stubbed
// 3. Run matching strategy - stubbed
// 4. Record shadow run result
// 5. Release lock
// 6. DO NOT commit any trades/wallets to DB
func (e *ShadowEngine) ProcessShadowOrder(ctx context.Context, jobData *ShadowJobData) error {
	runID := uuid.New().String()
	pairID := jobData.PairID
	orderID := jobData.TakerOrder.OrderID

	e.logger.Debug("shadow.processing",
		"run_id", runID,
		"pair_id", pairID,
		"order_id", orderID,
	)

	// Acquire lock
	if err := e.lockClient.Acquire(ctx); err != nil {
		e.shadowErrors.Add(1)
		return fmt.Errorf("shadow lock acquire: %w", err)
	}
	defer e.lockClient.Release(ctx)

	// Create shadow run record
	run := shadow.NewShadowRun(runID, pairID, orderID, shadow.ModeGoShadow)

	// Run shadow matching
	result, err := e.runShadowMatching(ctx, jobData)
	if err != nil {
		e.shadowErrors.Add(1)
		run.MarkError(err.Error())
	} else {
		e.shadowMatched.Add(1)
		run.MarkCompleted(result)
	}

	// Record to DB
	resultJSON, _ := result.ToJSON()
	if err := e.shadowRepo.InsertWithResult(ctx, runID, pairID, orderID, shadow.ModeGoShadow, run.Status, resultJSON); err != nil {
		e.logger.Error("shadow.insert_error",
			"run_id", runID,
			"error", err.Error(),
		)
		return fmt.Errorf("shadow insert: %w", err)
	}

	e.shadowProcessed.Add(1)
	return nil
}

// runShadowMatching executes the matching algorithm in shadow mode.
// This is a stub that simulates matching behavior.
func (e *ShadowEngine) runShadowMatching(ctx context.Context, jobData *ShadowJobData) (*shadow.ShadowResult, error) {
	order := jobData.TakerOrder

	// Check if market order (no fills possible without price)
	if order.IsMarket() && order.Price == nil {
		return &shadow.ShadowResult{
			Trades:    0,
			MatchRate: 0.0,
		}, nil
	}

	// Simulate matching: in a real implementation, this would:
	// 1. Load the order book from DB
	// 2. Apply the matching strategy
	// 3. Calculate fills and fees

	// For now, return a placeholder result
	// The actual matching logic should be in internal/domain/matching/
	// once that module is implemented

	fills := e.simulateFills(order)
	
	if len(fills) == 0 {
		return &shadow.ShadowResult{
			Trades:    0,
			MatchRate: 0.0,
		}, nil
	}

	// Calculate match rate
	totalFilled := big.NewInt(0)
	for _, fill := range fills {
		amt, _ := new(big.Int).SetString(fill.Amount, 10)
		totalFilled.Add(totalFilled, amt)
	}

	var matchRate float64
	if order.Amount.Sign() > 0 {
		matchRate = float64(0) / float64(1) // Placeholder
		_ = totalFilled // Used in real calculation
	}

	return &shadow.ShadowResult{
		Fills:     fills,
		Trades:    len(fills),
		MatchRate: matchRate,
	}, nil
}

// simulateFills generates mock fills for testing.
// In production, this should call the actual matching strategy.
func (e *ShadowEngine) simulateFills(order *domain.Order) []shadow.ShadowFill {
	// Stub implementation - returns empty fills
	// Real implementation would use the matching strategy
	return nil
}

// ProcessCanaryOrder processes an order in canary mode.
// In canary mode, orders are executed normally but results are compared.
func (e *ShadowEngine) ProcessCanaryOrder(ctx context.Context, jobData *ShadowJobData) error {
	runID := uuid.New().String()
	pairID := jobData.PairID
	orderID := jobData.TakerOrder.OrderID

	e.logger.Debug("canary.processing",
		"run_id", runID,
		"pair_id", pairID,
		"order_id", orderID,
	)

	// Acquire lock
	if err := e.lockClient.Acquire(ctx); err != nil {
		return fmt.Errorf("canary lock acquire: %w", err)
	}
	defer e.lockClient.Release(ctx)

	// Create shadow run record for canary
	run := shadow.NewShadowRun(runID, pairID, orderID, shadow.ModeGoCanary)

	// Run canary matching
	result, err := e.runCanaryMatching(ctx, jobData)
	if err != nil {
		run.MarkError(err.Error())
	} else {
		run.MarkCompleted(result)
	}

	// Record to DB
	resultJSON, _ := result.ToJSON()
	if err := e.shadowRepo.InsertWithResult(ctx, runID, pairID, orderID, shadow.ModeGoCanary, run.Status, resultJSON); err != nil {
		e.logger.Error("canary.insert_error",
			"run_id", runID,
			"error", err.Error(),
		)
	}

	return nil
}

// runCanaryMatching executes matching in canary mode with comparison to expected results.
func (e *ShadowEngine) runCanaryMatching(ctx context.Context, jobData *ShadowJobData) (*shadow.ShadowResult, error) {
	// In canary mode, we:
	// 1. Run shadow matching to get expected results
	// 2. The actual execution happens in the main matching path
	// 3. Reconciliation compares actual vs expected

	return e.runShadowMatching(ctx, jobData)
}

// GetMetrics returns shadow engine metrics for Prometheus.
func (e *ShadowEngine) GetMetrics() ShadowMetrics {
	return ShadowMetrics{
		Processed: e.shadowProcessed.Load(),
		Matched:   e.shadowMatched.Load(),
		Skipped:   e.shadowSkipped.Load(),
		Errors:    e.shadowErrors.Load(),
	}
}

// MetricsToPrometheus returns metrics in Prometheus text format.
func (e *ShadowEngine) MetricsToPrometheus() string {
	m := e.GetMetrics()
	return fmt.Sprintf(`# HELP matching_shadow_processed_total Total shadow orders processed.
# TYPE matching_shadow_processed_total counter
matching_shadow_processed_total %d
# HELP matching_shadow_matched_total Shadow orders with matches.
# TYPE matching_shadow_matched_total counter
matching_shadow_matched_total %d
# HELP matching_shadow_skipped_total Shadow orders skipped.
# TYPE matching_shadow_skipped_total counter
matching_shadow_skipped_total %d
# HELP matching_shadow_errors_total Shadow processing errors.
# TYPE matching_shadow_errors_total counter
matching_shadow_errors_total %d
`, m.Processed, m.Matched, m.Skipped, m.Errors)
}

// WithLock wraps a function with the lock client.
func (e *ShadowEngine) WithLock(ctx context.Context, pairID string, fn func() error) error {
	l := lock.NewDistributedLock(nil, pairID, uuid.New().String())
	// Note: In production, pass the actual Redis client
	// This is a placeholder that requires proper initialization

	if err := l.Acquire(ctx); err != nil {
		return err
	}
	defer l.Release(ctx)

	return fn()
}
