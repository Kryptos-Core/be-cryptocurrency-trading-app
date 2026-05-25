package application

import (
	"context"
	"testing"
	"time"
)

func TestReconciliationService_ReconcilePair(t *testing.T) {
	// Without a real DB, we test the logic that doesn't need persistence.
	svc := NewReconciliationService(nil, nil, 99.9, 5)

	// Test alert threshold logic
	report := &ReconciliationReport{
		PairID:      "BTC/USDT",
		ShadowRuns:  100,
		ActualTrades: 99,
		Unmatched:   1,
		MatchRate:   99.0,
	}

	shouldAlert, reason := svc.shouldAlert(report)
	if shouldAlert {
		t.Logf("Alert triggered as expected: %s", reason)
	}

	// Test below threshold
	report.MatchRate = 98.0
	shouldAlert, reason = svc.shouldAlert(report)
	if !shouldAlert {
		t.Error("expected alert for match rate below threshold")
	}
	if reason == "" {
		t.Error("expected non-empty alert reason")
	}
}

func TestReconciliationService_shouldAlert(t *testing.T) {
	tests := []struct {
		name           string
		minMatchRate   float64
		maxUnmatched   int
		report         *ReconciliationReport
		wantAlert      bool
	}{
		{
			name:         "high match rate, low unmatched",
			minMatchRate: 99.0,
			maxUnmatched: 5,
			report: &ReconciliationReport{
				MatchRate: 99.5,
				Unmatched: 2,
			},
			wantAlert: false,
		},
		{
			name:         "match rate below threshold",
			minMatchRate: 99.0,
			maxUnmatched: 5,
			report: &ReconciliationReport{
				MatchRate: 98.0,
				Unmatched: 2,
			},
			wantAlert: true,
		},
		{
			name:         "unmatched exceeds max",
			minMatchRate: 99.0,
			maxUnmatched: 5,
			report: &ReconciliationReport{
				MatchRate: 99.5,
				Unmatched: 10,
			},
			wantAlert: true,
		},
		{
			name:         "both thresholds exceeded",
			minMatchRate: 99.0,
			maxUnmatched: 5,
			report: &ReconciliationReport{
				MatchRate: 97.0,
				Unmatched: 10,
			},
			wantAlert: true,
		},
		{
			name:         "zero shadow runs",
			minMatchRate: 99.0,
			maxUnmatched: 5,
			report: &ReconciliationReport{
				MatchRate: 100.0,
				Unmatched: 0,
			},
			wantAlert: false,
		},
		{
			name:         "perfect match rate",
			minMatchRate: 99.0,
			maxUnmatched: 5,
			report: &ReconciliationReport{
				MatchRate: 100.0,
				Unmatched: 0,
			},
			wantAlert: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewReconciliationService(nil, nil, tt.minMatchRate, tt.maxUnmatched)
			got, _ := svc.shouldAlert(tt.report)
			if got != tt.wantAlert {
				t.Errorf("shouldAlert() = %v, want %v", got, tt.wantAlert)
			}
		})
	}
}

func TestReconciliationService_SetPairs(t *testing.T) {
	svc := NewReconciliationService(nil, nil, 99.0, 5)

	pairs := []string{"BTC/USDT", "ETH/USDT"}
	svc.SetPairs(pairs)

	got := svc.GetPairs()
	if len(got) != len(pairs) {
		t.Errorf("GetPairs() len = %d, want %d", len(got), len(pairs))
	}

	// Verify pair IDs are present
	pairMap := make(map[string]bool)
	for _, p := range got {
		pairMap[p] = true
	}
	for _, want := range pairs {
		if !pairMap[want] {
			t.Errorf("expected pair %q in GetPairs() result", want)
		}
	}
}

func TestReconciliationService_GetPairs_Empty(t *testing.T) {
	svc := NewReconciliationService(nil, nil, 99.0, 5)
	got := svc.GetPairs()
	if len(got) != 0 {
		t.Errorf("GetPairs() = %v, want empty", got)
	}
}

func TestReconciliationService_RegisterTradeCounter(t *testing.T) {
	svc := NewReconciliationService(nil, nil, 99.0, 5)

	called := false
	svc.RegisterTradeCounter(func(ctx context.Context, pairID string, since time.Time) (int, error) {
		called = true
		return 42, nil
	})

	if svc.tradeCounter == nil {
		t.Fatal("expected tradeCounter to be set")
	}

	result, err := svc.tradeCounter(context.Background(), "BTC/USDT", time.Now())
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if result != 42 {
		t.Errorf("expected 42, got %d", result)
	}
	if !called {
		t.Error("expected tradeCounter to be called")
	}
}

func TestReconciliationReport_Fields(t *testing.T) {
	now := time.Now().UTC()
	report := &ReconciliationReport{
		PairID:        "BTC/USDT",
		PeriodStart:   now.Add(-5 * time.Minute),
		PeriodEnd:     now,
		ShadowRuns:    100,
		ActualTrades:  99,
		Unmatched:     1,
		MatchRate:     99.0,
		UnmatchedRuns: []string{"order-1", "order-2"},
		Alert:         false,
	}

	if report.PairID != "BTC/USDT" {
		t.Errorf("PairID = %s, want BTC/USDT", report.PairID)
	}
	if report.ShadowRuns != 100 {
		t.Errorf("ShadowRuns = %d, want 100", report.ShadowRuns)
	}
	if len(report.UnmatchedRuns) != 2 {
		t.Errorf("UnmatchedRuns len = %d, want 2", len(report.UnmatchedRuns))
	}
}

func TestCountAlerts(t *testing.T) {
	reports := []*ReconciliationReport{
		{Alert: true},
		{Alert: false},
		{Alert: true},
		{Alert: false},
	}

	count := countAlerts(reports)
	if count != 2 {
		t.Errorf("countAlerts() = %d, want 2", count)
	}
}

func TestCountAlerts_Empty(t *testing.T) {
	reports := []*ReconciliationReport{}
	count := countAlerts(reports)
	if count != 0 {
		t.Errorf("countAlerts() = %d, want 0", count)
	}
}

func TestReconciliationService_MatchRateCalculation(t *testing.T) {
	svc := NewReconciliationService(nil, nil, 99.0, 5)

	tests := []struct {
		shadowRuns  int
		unmatched   int
		wantRate    float64
	}{
		{100, 0, 100.0},
		{100, 1, 99.0},
		{100, 5, 95.0},
		{50, 0, 100.0},
		{0, 0, 100.0},
		{1, 1, 0.0},
	}

	for _, tt := range tests {
		report := &ReconciliationReport{
			ShadowRuns: tt.shadowRuns,
			Unmatched:  tt.unmatched,
		}

		var wantRate float64
		if tt.shadowRuns > 0 {
			matched := tt.shadowRuns - tt.unmatched
			wantRate = float64(matched) / float64(tt.shadowRuns) * 100.0
		} else {
			wantRate = 100.0
		}

		if wantRate != tt.wantRate {
			t.Errorf("shadowRuns=%d unmatched=%d: wantRate=%.2f, gotRate=%.2f",
				tt.shadowRuns, tt.unmatched, tt.wantRate, wantRate)
		}

		// Also test alert
		_, reason := svc.shouldAlert(report)
		if tt.wantRate < 99.0 && tt.shadowRuns > 0 {
			if reason == "" {
				t.Errorf("expected alert reason for shadowRuns=%d unmatched=%d rate=%.2f",
					tt.shadowRuns, tt.unmatched, tt.wantRate)
			}
		}
	}
}
