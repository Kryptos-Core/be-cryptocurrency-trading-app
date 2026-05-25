package application

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/kryptos/go-services/matching-engine/internal/infrastructure/persistence"
)

// ReconciliationService checks parity between shadow runs and actual trades.
type ReconciliationService struct {
	shadowRepo    *persistence.ShadowRepository
	logger        *slog.Logger
	minMatchRate  float64
	maxUnmatched  int

	// Runtime pair list (can be updated)
	pairs    []string
	pairsMu  sync.RWMutex

	// Trade counter interface (optional, for actual trade count)
	tradeCounter func(ctx context.Context, pairID string, since time.Time) (int, error)
}

// ReconciliationReport contains the results of a reconciliation check.
type ReconciliationReport struct {
	PairID         string    `json:"pair_id"`
	PeriodStart    time.Time `json:"period_start"`
	PeriodEnd      time.Time `json:"period_end"`
	ShadowRuns     int       `json:"shadow_runs"`
	ActualTrades   int       `json:"actual_trades"`
	Unmatched      int       `json:"unmatched"`
	MatchRate      float64   `json:"match_rate_percent"`
	UnmatchedRuns  []string  `json:"unmatched_order_ids"`
	Alert          bool      `json:"alert"`
	AlertReason    string    `json:"alert_reason,omitempty"`
}

// NewReconciliationService creates a new ReconciliationService.
func NewReconciliationService(
	shadowRepo *persistence.ShadowRepository,
	logger *slog.Logger,
	minMatchRate float64,
	maxUnmatched int,
) *ReconciliationService {
	return &ReconciliationService{
		shadowRepo:   shadowRepo,
		logger:       logger,
		minMatchRate: minMatchRate,
		maxUnmatched: maxUnmatched,
		pairs:        []string{},
	}
}

// SetPairs updates the list of trading pairs to reconcile.
func (s *ReconciliationService) SetPairs(pairs []string) {
	s.pairsMu.Lock()
	defer s.pairsMu.Unlock()
	s.pairs = make([]string, len(pairs))
	copy(s.pairs, pairs)
}

// GetPairs returns the current list of trading pairs.
func (s *ReconciliationService) GetPairs() []string {
	s.pairsMu.RLock()
	defer s.pairsMu.RUnlock()
	result := make([]string, len(s.pairs))
	copy(result, s.pairs)
	return result
}

// ReconcilePair checks shadow runs for a pair and compares with actual trades.
// Returns a report with match rate and any discrepancies.
func (s *ReconciliationService) ReconcilePair(ctx context.Context, pairID string, since time.Time) (*ReconciliationReport, error) {
	now := time.Now().UTC()
	report := &ReconciliationReport{
		PairID:      pairID,
		PeriodStart: since,
		PeriodEnd:   now,
	}

	// Get unmatched shadow runs
	unmatched, err := s.shadowRepo.GetUnmatched(ctx, pairID, since, 100)
	if err != nil {
		return nil, fmt.Errorf("reconcile get unmatched: %w", err)
	}
	report.Unmatched = len(unmatched)
	report.UnmatchedRuns = make([]string, 0, len(unmatched))
	for _, rec := range unmatched {
		report.UnmatchedRuns = append(report.UnmatchedRuns, rec.OrderID)
	}

	// Get total shadow runs count
	statusCounts, err := s.shadowRepo.CountByStatus(ctx, pairID, since)
	if err != nil {
		return nil, fmt.Errorf("reconcile count status: %w", err)
	}
	report.ShadowRuns = 0
	for _, cnt := range statusCounts {
		report.ShadowRuns += cnt
	}

	// Get actual trade count if counter is registered
	if s.tradeCounter != nil {
		actualTrades, err := s.tradeCounter(ctx, pairID, since)
		if err != nil {
			s.logger.Warn("reconciliation.trade_count_error",
				"pair_id", pairID,
				"error", err.Error(),
			)
		} else {
			report.ActualTrades = actualTrades
		}
	}

	// Calculate match rate
	if report.ShadowRuns > 0 {
		matched := report.ShadowRuns - report.Unmatched
		report.MatchRate = float64(matched) / float64(report.ShadowRuns) * 100.0
	} else {
		report.MatchRate = 100.0
	}

	// Check for alerts
	report.Alert, report.AlertReason = s.shouldAlert(report)

	return report, nil
}

// ReconcileAll reconciles all configured pairs for the given time window.
func (s *ReconciliationService) ReconcileAll(ctx context.Context, since time.Time) ([]*ReconciliationReport, error) {
	s.pairsMu.RLock()
	pairs := s.pairs
	s.pairsMu.RUnlock()

	reports := make([]*ReconciliationReport, 0, len(pairs))
	for _, pair := range pairs {
		report, err := s.ReconcilePair(ctx, pair, since)
		if err != nil {
			s.logger.Error("reconciliation.pair_error",
				"pair_id", pair,
				"error", err.Error(),
			)
			continue
		}
		reports = append(reports, report)

		// Handle alert if needed
		if report.Alert {
			s.Alert(ctx, report)
		}
	}

	return reports, nil
}

// shouldAlert determines if a report should trigger an alert.
func (s *ReconciliationService) shouldAlert(report *ReconciliationReport) (bool, string) {
	// Check match rate threshold
	if report.MatchRate < s.minMatchRate {
		return true, fmt.Sprintf(
			"match_rate_below_threshold: got %.2f%%, expected >= %.2f%%",
			report.MatchRate, s.minMatchRate,
		)
	}

	// Check unmatched runs threshold
	if report.Unmatched > s.maxUnmatched {
		return true, fmt.Sprintf(
			"unmatched_runs_exceeded: got %d, max allowed %d",
			report.Unmatched, s.maxUnmatched,
		)
	}

	return false, ""
}

// Alert handles reconciliation alerts by logging and potentially notifying.
func (s *ReconciliationService) Alert(ctx context.Context, report *ReconciliationReport) {
	s.logger.Error("reconciliation.alert",
		"pair_id", report.PairID,
		"shadow_runs", report.ShadowRuns,
		"actual_trades", report.ActualTrades,
		"unmatched", report.Unmatched,
		"match_rate", report.MatchRate,
		"reason", report.AlertReason,
		"period_start", report.PeriodStart,
		"period_end", report.PeriodEnd,
	)

	// TODO: Add external alerting integration (PagerDuty, Slack, etc.)
	// This is a placeholder for future alerting implementation
}

// RegisterTradeCounter registers a function to count actual trades.
func (s *ReconciliationService) RegisterTradeCounter(counter func(ctx context.Context, pairID string, since time.Time) (int, error)) {
	s.tradeCounter = counter
}

// RunReconciliation starts a background reconciliation loop.
// Runs every interval duration, checking all active pairs.
func (s *ReconciliationService) RunReconciliation(ctx context.Context, interval time.Duration, pairs []string) {
	s.SetPairs(pairs)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	s.logger.Info("reconciliation.starting",
		"interval", interval.String(),
		"pairs", pairs,
		"min_match_rate", s.minMatchRate,
		"max_unmatched", s.maxUnmatched,
	)

	// Run initial reconciliation
	s.runOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("reconciliation.stopping", "reason", ctx.Err())
			return
		case <-ticker.C:
			s.runOnce(ctx)
		}
	}
}

// runOnce performs a single reconciliation cycle.
func (s *ReconciliationService) runOnce(ctx context.Context) {
	// Default to last 5 minutes
	since := time.Now().UTC().Add(-5 * time.Minute)

	reports, err := s.ReconcileAll(ctx, since)
	if err != nil {
		s.logger.Error("reconciliation.cycle_error", "error", err.Error())
		return
	}

	s.logger.Info("reconciliation.cycle_completed",
		"pairs_checked", len(reports),
		"alerts_triggered", countAlerts(reports),
	)
}

// countAlerts counts the number of reports with alerts.
func countAlerts(reports []*ReconciliationReport) int {
	count := 0
	for _, r := range reports {
		if r.Alert {
			count++
		}
	}
	return count
}
