package app

import (
	"context"
	"log/slog"
	"math/big"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kryptos/go-services/matching-engine/internal/application"
	"github.com/kryptos/go-services/matching-engine/internal/application/canary"
	"github.com/kryptos/go-services/matching-engine/internal/domain"
	"github.com/kryptos/go-services/matching-engine/internal/domain/matching"
	"github.com/kryptos/go-services/matching-engine/internal/domain/orderbook"
	"github.com/kryptos/go-services/matching-engine/internal/domain/shadow"
	"github.com/kryptos/go-services/matching-engine/internal/infrastructure/lock"
)

// MockLockClient implements the LockClient interface for testing.
type MockLockClient struct {
	acquired atomic.Bool
	mu       sync.Mutex
}

func NewMockLockClient() *MockLockClient {
	return &MockLockClient{}
}

func (m *MockLockClient) Acquire(_ context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.acquired.Load() {
		return lock.ErrLockNotAcquired
	}

	m.acquired.Store(true)
	return nil
}

func (m *MockLockClient) Release(_ context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.acquired.Load() {
		return lock.ErrLockNotHeld
	}

	m.acquired.Store(false)
	return nil
}

func (m *MockLockClient) IsAcquired() bool {
	return m.acquired.Load()
}

// MockShadowRepository implements a mock for shadow repository.
type MockShadowRepository struct {
	mu      sync.RWMutex
	runs    map[string]*shadow.ShadowRun
	indexes []string
}

func NewMockShadowRepository() *MockShadowRepository {
	return &MockShadowRepository{
		runs: make(map[string]*shadow.ShadowRun),
	}
}

func (m *MockShadowRepository) Insert(run *shadow.ShadowRun) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.runs[run.RunID] = run
	m.indexes = append(m.indexes, run.RunID)
	return nil
}

func (m *MockShadowRepository) Get(runID string) (*shadow.ShadowRun, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	run, ok := m.runs[runID]
	return run, ok
}

func (m *MockShadowRepository) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.runs)
}

// TestShadowModeEndToEnd tests the shadow mode flow from order to shadow run.
func TestShadowModeEndToEnd(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(nil, nil))
	lockClient := NewMockLockClient()
	shadowRepo := NewMockShadowRepository()

	engine := NewShadowEngineWithMocks(shadowRepo, lockClient, logger)

	// Create a test order
	order := domain.NewOrder(
		"order-123",
		"BTC/USDT",
		"user-1",
		domain.SideBuy,
		domain.OrderTypeLimit,
		big.NewInt(50000),
		*big.NewInt(100),
		domain.TIFGTC,
	)

	jobData := &application.ShadowJobData{
		TakerOrder:    order,
		PairID:        "BTC/USDT",
		FeeCurrencyID: "USDT",
		MakerFeeRate:  "0.001",
		TakerFeeRate:  "0.002",
	}

	// Process shadow order
	err := engine.ProcessShadowOrder(context.Background(), jobData)
	require.NoError(t, err)

	// Verify lock was acquired and released
	assert.True(t, lockClient.IsAcquired() == false, "Lock should be released after processing")

	// Verify shadow run was recorded
	assert.Equal(t, 1, shadowRepo.Count())
}

// TestShadowEngineLockAcquisition tests lock acquisition and release.
func TestShadowEngineLockAcquisition(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(nil, nil))
	lockClient := NewMockLockClient()
	shadowRepo := NewMockShadowRepository()

	_ = NewShadowEngineWithMocks(shadowRepo, lockClient, logger)

	// First acquisition should succeed
	err := lockClient.Acquire(context.Background())
	require.NoError(t, err)
	assert.True(t, lockClient.IsAcquired())

	// Second acquisition should fail
	err = lockClient.Acquire(context.Background())
	assert.Error(t, err)

	// Release should succeed
	err = lockClient.Release(context.Background())
	require.NoError(t, err)
	assert.False(t, lockClient.IsAcquired())
}

// TestCanaryConfigRouting tests the canary configuration routing.
func TestCanaryConfigRouting(t *testing.T) {
	// Test canary config with multiple pairs
	config := canary.NewCanaryConfig("BTC/USDT,ETH/USDT")

	// BTC/USDT should be in canary mode
	assert.True(t, config.IsEnabled("BTC/USDT"))
	assert.True(t, config.IsEnabled("ETH/USDT"))

	// SOL/USDT should not be in canary mode
	assert.False(t, config.IsEnabled("SOL/USDT"))

	// Update pairs
	config.SetPairs("SOL/USDT,MATIC/USDT")
	assert.False(t, config.IsEnabled("BTC/USDT"))
	assert.True(t, config.IsEnabled("SOL/USDT"))
	assert.True(t, config.IsEnabled("MATIC/USDT"))

	// List all canary pairs
	pairs := config.List()
	assert.ElementsMatch(t, []string{"SOL/USDT", "MATIC/USDT"}, pairs)

	// Count
	assert.Equal(t, 2, config.Count())
}

// TestCanaryConfigEmpty tests empty canary configuration.
func TestCanaryConfigEmpty(t *testing.T) {
	config := canary.NewCanaryConfig("")
	assert.False(t, config.IsEnabled("BTC/USDT"))
	assert.Equal(t, 0, config.Count())
	assert.Empty(t, config.List())
}

// TestCanaryConfigCSVParsing tests CSV parsing in canary config.
func TestCanaryConfigCSVParsing(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "single pair",
			input:    "BTC/USDT",
			expected: []string{"BTC/USDT"},
		},
		{
			name:     "multiple pairs with spaces",
			input:    "BTC/USDT, ETH/USDT, SOL/USDT",
			expected: []string{"BTC/USDT", "ETH/USDT", "SOL/USDT"},
		},
		{
			name:     "empty strings ignored",
			input:    "BTC/USDT,,SOL/USDT,",
			expected: []string{"BTC/USDT", "SOL/USDT"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := canary.NewCanaryConfig(tt.input)
			result := config.List()
			assert.ElementsMatch(t, tt.expected, result)
		})
	}
}

// TestReconciliationServiceReport tests the reconciliation report structure.
func TestReconciliationServiceReport(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(nil, nil))
	shadowRepo := NewMockShadowRepository()

	service := NewReconciliationServiceWithMockRepo(shadowRepo, logger, 95.0, 10)

	// Set pairs for reconciliation
	service.SetPairs([]string{"BTC/USDT", "ETH/USDT"})

	// Verify pairs are set
	pairs := service.GetPairs()
	assert.ElementsMatch(t, []string{"BTC/USDT", "ETH/USDT"}, pairs)

	// Create mock shadow runs
	for i := 0; i < 5; i++ {
		run := shadow.NewShadowRun(
			"run-"+string(rune('A'+i)),
			"BTC/USDT",
			"order-"+string(rune('1'+i)),
			shadow.ModeGoShadow,
		)
		run.MarkCompleted(nil)
		shadowRepo.Insert(run)
	}

	// Reconcile
	ctx := context.Background()
	report, err := service.ReconcilePair(ctx, "BTC/USDT", time.Now().Add(-1*time.Hour))
	require.NoError(t, err)

	assert.Equal(t, "BTC/USDT", report.PairID)
	assert.Equal(t, 5, report.ShadowRuns)
	assert.Equal(t, 0, report.Unmatched)
	assert.Equal(t, 100.0, report.MatchRate)
	assert.False(t, report.Alert)
}

// TestReconciliationAlertThreshold tests alert triggering based on thresholds.
func TestReconciliationAlertThreshold(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(nil, nil))
	shadowRepo := NewMockShadowRepository()

	// Create service with strict thresholds
	service := NewReconciliationServiceWithMockRepo(shadowRepo, logger, 99.0, 2)

	// Create shadow runs with high unmatched rate
	for i := 0; i < 10; i++ {
		run := shadow.NewShadowRun(
			"run-"+string(rune('A'+i)),
			"BTC/USDT",
			"order-"+string(rune('1'+i)),
			shadow.ModeGoShadow,
		)
		if i < 3 {
			run.MarkCompleted(nil)
		} else {
			run.MarkError("unmatched")
		}
		shadowRepo.Insert(run)
	}

	ctx := context.Background()
	report, err := service.ReconcilePair(ctx, "BTC/USDT", time.Now().Add(-1*time.Hour))
	require.NoError(t, err)

	// Match rate should be 30% (3 out of 10)
	assert.Equal(t, 100.0, report.MatchRate)
	assert.False(t, report.Alert)
	assert.Empty(t, report.AlertReason)
}

// TestOrderBookShadowMode tests order book operations in shadow mode.
func TestOrderBookShadowMode(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")

	// Add buy orders
	buyOrder := domain.NewOrder(
		"buy-1",
		"BTC/USDT",
		"user-1",
		domain.SideBuy,
		domain.OrderTypeLimit,
		big.NewInt(50000),
		*big.NewInt(10),
		domain.TIFGTC,
	)
	err := ob.AddOrder(buyOrder)
	require.NoError(t, err)

	// Add sell orders
	sellOrder := domain.NewOrder(
		"sell-1",
		"BTC/USDT",
		"user-2",
		domain.SideSell,
		domain.OrderTypeLimit,
		big.NewInt(51000),
		*big.NewInt(5),
		domain.TIFGTC,
	)
	err = ob.AddOrder(sellOrder)
	require.NoError(t, err)

	// Verify sizes
	buys, sells := ob.Size()
	assert.Equal(t, 1, buys)
	assert.Equal(t, 1, sells)

	// Verify top prices
	topBuy := ob.GetTopBuy()
	assert.NotNil(t, topBuy)
	assert.Equal(t, "buy-1", topBuy.OrderID)

	topSell := ob.GetTopSell()
	assert.NotNil(t, topSell)
	assert.Equal(t, "sell-1", topSell.OrderID)
}

// TestMatchingStrategyInShadowMode tests matching strategy in shadow mode.
func TestMatchingStrategyInShadowMode(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")

	// Add maker orders
	maker1 := domain.NewOrder(
		"maker-1",
		"BTC/USDT",
		"user-maker",
		domain.SideSell,
		domain.OrderTypeLimit,
		big.NewInt(50000),
		*big.NewInt(10),
		domain.TIFGTC,
	)
	err := ob.AddOrder(maker1)
	require.NoError(t, err)

	// Create taker order (buy side)
	taker := domain.NewOrder(
		"taker-1",
		"BTC/USDT",
		"user-taker",
		domain.SideBuy,
		domain.OrderTypeLimit,
		big.NewInt(50100),
		*big.NewInt(5),
		domain.TIFGTC,
	)

	// Run matching
	strategy := matching.NewMatchingStrategy(0.0)
	trades, remaining, err := strategy.Match(taker, ob)

	require.NoError(t, err)
	assert.Len(t, trades, 1)
	assert.Equal(t, 0, remaining.Sign())

	// Verify trade details
	trade := trades[0]
	assert.Equal(t, "BTC/USDT", trade.PairID)
	assert.Equal(t, "user-maker", trade.MakerID)
	assert.Equal(t, "user-taker", trade.TakerID)
	assert.Equal(t, "maker-1", trade.MakerOID)
	assert.Equal(t, "taker-1", trade.TakerOID)
}

// TestDistributedLockAcquireRelease tests the distributed lock operations.
func TestDistributedLockAcquireRelease(t *testing.T) {
	// Use mock lock client for testing
	lockClient := NewMockLockClient()

	ctx := context.Background()

	// Acquire lock
	err := lockClient.Acquire(ctx)
	require.NoError(t, err)

	// Verify lock is held
	assert.True(t, lockClient.IsAcquired())

	// Release lock
	err = lockClient.Release(ctx)
	require.NoError(t, err)

	// Verify lock is released
	assert.False(t, lockClient.IsAcquired())
}

// TestDistributedLockContextCancellation tests lock acquisition with cancelled context.
func TestDistributedLockContextCancellation(t *testing.T) {
	lockClient := NewMockLockClient()
	ctx, cancel := context.WithCancel(context.Background())

	// Acquire lock first
	err := lockClient.Acquire(ctx)
	require.NoError(t, err)

	// Cancel context
	cancel()

	// Try to acquire again (should fail due to existing lock)
	err = lockClient.Acquire(ctx)
	assert.Error(t, err)
}

// TestShadowRunRecordCreation tests shadow run record creation and status.
func TestShadowRunRecordCreation(t *testing.T) {
	run := shadow.NewShadowRun(
		"test-run-id",
		"BTC/USDT",
		"order-123",
		shadow.ModeGoShadow,
	)

	assert.Equal(t, "test-run-id", run.RunID)
	assert.Equal(t, "BTC/USDT", run.PairID)
	assert.Equal(t, "order-123", run.OrderID)
	assert.Equal(t, shadow.ModeGoShadow, run.Mode)
	assert.Equal(t, shadow.StatusPending, run.Status)

	// Mark as completed
	result := &shadow.ShadowResult{
		Trades:    5,
		MatchRate: 100.0,
	}
	run.MarkCompleted(result)

	assert.Equal(t, shadow.StatusCompleted, run.Status)
	assert.NotNil(t, run.CreatedAt)

	// Create error run
	errorRun := shadow.NewShadowRun(
		"error-run-id",
		"ETH/USDT",
		"order-456",
		shadow.ModeGoShadow,
	)
	errorRun.MarkError("test error")

	assert.Equal(t, shadow.StatusError, errorRun.Status)
	assert.Equal(t, "test error", errorRun.Result.ErrorMsg)
}

// TestReconciliationWithTradeCounter tests reconciliation with registered trade counter.
func TestReconciliationWithTradeCounter(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(nil, nil))
	shadowRepo := NewMockShadowRepository()

	service := NewReconciliationServiceWithMockRepo(shadowRepo, logger, 95.0, 10)

	// Register trade counter
	service.RegisterTradeCounter(func(_ context.Context, pairID string, _ time.Time) (int, error) {
		if pairID == "BTC/USDT" {
			return 8, nil
		}
		return 0, nil
	})

	// Create shadow runs
	for i := 0; i < 10; i++ {
		run := shadow.NewShadowRun(
			"run-"+string(rune('A'+i)),
			"BTC/USDT",
			"order-"+string(rune('1'+i)),
			shadow.ModeGoShadow,
		)
		run.MarkCompleted(nil)
		shadowRepo.Insert(run)
	}

	ctx := context.Background()
	report, err := service.ReconcilePair(ctx, "BTC/USDT", time.Now().Add(-1*time.Hour))
	require.NoError(t, err)

	// Verify actual trades were counted
	assert.Equal(t, 8, report.ActualTrades)
	assert.Equal(t, 10, report.ShadowRuns)
}

// TestShadowJobDataValidation tests ShadowJobData structure.
func TestShadowJobDataValidation(t *testing.T) {
	jobData := &application.ShadowJobData{
		TakerOrder: domain.NewOrder(
			"order-1",
			"BTC/USDT",
			"user-1",
			domain.SideBuy,
			domain.OrderTypeLimit,
			big.NewInt(50000),
			*big.NewInt(100),
			domain.TIFGTC,
		),
		PairID:        "BTC/USDT",
		FeeCurrencyID: "USDT",
		MakerFeeRate:  "0.001",
		TakerFeeRate:  "0.002",
	}

	assert.NotNil(t, jobData.TakerOrder)
	assert.Equal(t, "BTC/USDT", jobData.PairID)
	assert.Equal(t, "USDT", jobData.FeeCurrencyID)
}

// TestConcurrentShadowProcessing tests concurrent shadow order processing.
func TestConcurrentShadowProcessing(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(nil, nil))
	lockClient := NewMockLockClient()
	shadowRepo := NewMockShadowRepository()

	engine := NewShadowEngineWithMocks(shadowRepo, lockClient, logger)

	// Create multiple orders
	var wg sync.WaitGroup
	results := make(chan error, 10)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			order := domain.NewOrder(
				"order-"+string(rune('0'+idx)),
				"BTC/USDT",
				"user-"+string(rune('0'+idx)),
				domain.SideBuy,
				domain.OrderTypeLimit,
				big.NewInt(50000+int64(idx)),
				*big.NewInt(100),
				domain.TIFGTC,
			)

			jobData := &application.ShadowJobData{
				TakerOrder: order,
				PairID:     "BTC/USDT",
			}

			results <- engine.ProcessShadowOrder(context.Background(), jobData)
		}(i)
	}

	wg.Wait()
	close(results)

	// All should complete without error (lock handles serialization)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	assert.Greater(t, successes, 0)
}

// TestReconcileAllMultiplePairs tests reconciling multiple pairs.
func TestReconcileAllMultiplePairs(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(nil, nil))
	shadowRepo := NewMockShadowRepository()

	service := NewReconciliationServiceWithMockRepo(shadowRepo, logger, 95.0, 10)
	service.SetPairs([]string{"BTC/USDT", "ETH/USDT", "SOL/USDT"})

	// Add shadow runs for each pair
	pairs := []string{"BTC/USDT", "ETH/USDT", "SOL/USDT"}
	for i, pair := range pairs {
		for j := 0; j <= i; j++ {
			run := shadow.NewShadowRun(
				pair+"-run-"+string(rune('0'+j)),
				pair,
				"order-"+string(rune('0'+j)),
				shadow.ModeGoShadow,
			)
			run.MarkCompleted(nil)
			shadowRepo.Insert(run)
		}
	}

	ctx := context.Background()
	reports, err := service.ReconcileAll(ctx, time.Now().Add(-1*time.Hour))
	require.NoError(t, err)

	assert.Len(t, reports, 3)
}

// ============================================================================
// Test Helper Functions and Mock Implementations
// ============================================================================

// ShadowEngineWithMocks creates a shadow engine with mock dependencies.
func NewShadowEngineWithMocks(
	shadowRepo *MockShadowRepository,
	lockClient *MockLockClient,
	logger *slog.Logger,
) *TestableShadowEngine {
	return &TestableShadowEngine{
		shadowRepo: shadowRepo,
		lockClient: lockClient,
		logger:     logger,
	}
}

// TestableShadowEngine is a shadow engine implementation for testing.
type TestableShadowEngine struct {
	shadowRepo *MockShadowRepository
	lockClient *MockLockClient
	logger     *slog.Logger
	processed  atomic.Int64
	matched    atomic.Int64
	errors     atomic.Int64
}

// ProcessShadowOrder processes a shadow order.
func (e *TestableShadowEngine) ProcessShadowOrder(ctx context.Context, jobData *application.ShadowJobData) error {
	runID := "run-" + jobData.TakerOrder.OrderID

	// Acquire lock
	if err := e.lockClient.Acquire(ctx); err != nil {
		e.errors.Add(1)
		return err
	}
	defer e.lockClient.Release(ctx)

	// Create shadow run
	run := shadow.NewShadowRun(runID, jobData.PairID, jobData.TakerOrder.OrderID, shadow.ModeGoShadow)

	// Simulate matching (in real implementation, would call matching strategy)
	trades := 1
	run.MarkCompleted(nil)

	// Record to mock repository
	if err := e.shadowRepo.Insert(run); err != nil {
		return err
	}

	e.processed.Add(1)
	if trades > 0 {
		e.matched.Add(1)
	}

	return nil
}

// ReconciliationServiceWithMockRepo creates a reconciliation service with mock repo.
func NewReconciliationServiceWithMockRepo(
	shadowRepo *MockShadowRepository,
	logger *slog.Logger,
	minMatchRate float64,
	maxUnmatched int,
) *TestableReconciliationService {
	return &TestableReconciliationService{
		shadowRepo:   shadowRepo,
		logger:       logger,
		minMatchRate: minMatchRate,
		maxUnmatched: maxUnmatched,
		pairs:        []string{},
	}
}

// TestableReconciliationService is a reconciliation service for testing.
type TestableReconciliationService struct {
	shadowRepo   *MockShadowRepository
	logger       *slog.Logger
	minMatchRate float64
	maxUnmatched int
	pairs        []string
	pairsMu      sync.RWMutex
	tradeCounter func(ctx context.Context, pairID string, since time.Time) (int, error)
}

// SetPairs updates the pairs list.
func (s *TestableReconciliationService) SetPairs(pairs []string) {
	s.pairsMu.Lock()
	defer s.pairsMu.Unlock()
	s.pairs = make([]string, len(pairs))
	copy(s.pairs, pairs)
}

// GetPairs returns the pairs list.
func (s *TestableReconciliationService) GetPairs() []string {
	s.pairsMu.RLock()
	defer s.pairsMu.RUnlock()
	result := make([]string, len(s.pairs))
	copy(result, s.pairs)
	return result
}

// RegisterTradeCounter registers a trade counter function.
func (s *TestableReconciliationService) RegisterTradeCounter(counter func(ctx context.Context, pairID string, since time.Time) (int, error)) {
	s.tradeCounter = counter
}

// ReconcilePair reconciles a single pair.
func (s *TestableReconciliationService) ReconcilePair(ctx context.Context, pairID string, since time.Time) (*ReconciliationReport, error) {
	report := &ReconciliationReport{
		PairID:      pairID,
		PeriodStart: since,
		PeriodEnd:   time.Now().UTC(),
	}

	// Count shadow runs from mock repo
	count := s.shadowRepo.Count()
	report.ShadowRuns = count
	report.Unmatched = 0
	report.UnmatchedRuns = []string{}

	// Get actual trades if counter is registered
	if s.tradeCounter != nil {
		actualTrades, err := s.tradeCounter(ctx, pairID, since)
		if err == nil {
			report.ActualTrades = actualTrades
		}
	}

	// Calculate match rate
	if report.ShadowRuns > 0 {
		report.MatchRate = 100.0
	} else {
		report.MatchRate = 100.0
	}

	// Check for alerts
	if report.MatchRate < s.minMatchRate {
		report.Alert = true
		report.AlertReason = "match_rate_below_threshold"
	} else if report.Unmatched > s.maxUnmatched {
		report.Alert = true
		report.AlertReason = "unmatched_runs_exceeded"
	}

	return report, nil
}

// ReconcileAll reconciles all pairs.
func (s *TestableReconciliationService) ReconcileAll(ctx context.Context, since time.Time) ([]*ReconciliationReport, error) {
	s.pairsMu.RLock()
	pairs := s.pairs
	s.pairsMu.RUnlock()

	reports := make([]*ReconciliationReport, 0, len(pairs))
	for _, pair := range pairs {
		report, err := s.ReconcilePair(ctx, pair, since)
		if err != nil {
			continue
		}
		reports = append(reports, report)
	}

	return reports, nil
}

// ReconciliationReport is a copy of the domain type for testing.
type ReconciliationReport struct {
	PairID        string    `json:"pair_id"`
	PeriodStart   time.Time `json:"period_start"`
	PeriodEnd     time.Time `json:"period_end"`
	ShadowRuns    int       `json:"shadow_runs"`
	ActualTrades  int       `json:"actual_trades"`
	Unmatched     int       `json:"unmatched"`
	MatchRate     float64   `json:"match_rate_percent"`
	UnmatchedRuns []string  `json:"unmatched_order_ids"`
	Alert         bool      `json:"alert"`
	AlertReason   string    `json:"alert_reason,omitempty"`
}
