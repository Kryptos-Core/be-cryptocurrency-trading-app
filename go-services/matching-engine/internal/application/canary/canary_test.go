package canary

import (
	"testing"
)

func TestNewCanaryConfig(t *testing.T) {
	cc := NewCanaryConfig("")
	if cc.Count() != 0 {
		t.Errorf("expected 0 pairs, got %d", cc.Count())
	}
}

func TestCanaryConfig_SetPairs(t *testing.T) {
	cc := NewCanaryConfig("")

	cc.SetPairs("BTC/USDT,ETH/USDT")
	if cc.Count() != 2 {
		t.Errorf("expected 2 pairs, got %d", cc.Count())
	}
	if !cc.IsEnabled("BTC/USDT") {
		t.Error("expected BTC/USDT to be enabled")
	}
	if !cc.IsEnabled("ETH/USDT") {
		t.Error("expected ETH/USDT to be enabled")
	}
}

func TestCanaryConfig_SetPairs_Single(t *testing.T) {
	cc := NewCanaryConfig("")
	cc.SetPairs("SOL/USDT")

	if cc.Count() != 1 {
		t.Errorf("expected 1 pair, got %d", cc.Count())
	}
	if !cc.IsEnabled("SOL/USDT") {
		t.Error("expected SOL/USDT to be enabled")
	}
	if cc.IsEnabled("BTC/USDT") {
		t.Error("expected BTC/USDT to NOT be enabled")
	}
}

func TestCanaryConfig_SetPairs_WithSpaces(t *testing.T) {
	cc := NewCanaryConfig("")
	cc.SetPairs("BTC/USDT, ETH/USDT , SOL/USDT")

	if cc.Count() != 3 {
		t.Errorf("expected 3 pairs, got %d", cc.Count())
	}
}

func TestCanaryConfig_SetPairs_EmptyValues(t *testing.T) {
	cc := NewCanaryConfig("")
	cc.SetPairs("BTC/USDT,, ETH/USDT, , SOL/USDT")

	if cc.Count() != 3 {
		t.Errorf("expected 3 pairs, got %d", cc.Count())
	}
}

func TestCanaryConfig_List(t *testing.T) {
	cc := NewCanaryConfig("BTC/USDT,ETH/USDT")

	pairs := cc.List()
	if len(pairs) != 2 {
		t.Errorf("expected 2 pairs in list, got %d", len(pairs))
	}

	// Verify both pairs are in the list
	pairSet := make(map[string]bool)
	for _, p := range pairs {
		pairSet[p] = true
	}
	if !pairSet["BTC/USDT"] || !pairSet["ETH/USDT"] {
		t.Error("expected both pairs in list")
	}
}

func TestCanaryConfig_List_Empty(t *testing.T) {
	cc := NewCanaryConfig("")
	pairs := cc.List()
	if len(pairs) != 0 {
		t.Errorf("expected 0 pairs, got %d", len(pairs))
	}
}

func TestCanaryConfig_IsEnabled_NotEnabled(t *testing.T) {
	cc := NewCanaryConfig("BTC/USDT")

	if cc.IsEnabled("ETH/USDT") {
		t.Error("expected ETH/USDT to NOT be enabled")
	}
}

func TestCanaryConfig_Count(t *testing.T) {
	tests := []struct {
		csv      string
		expected int
	}{
		{"", 0},
		{"BTC/USDT", 1},
		{"BTC/USDT,ETH/USDT", 2},
		{"BTC/USDT,ETH/USDT,SOL/USDT", 3},
		{"BTC/USDT, ETH/USDT , SOL/USDT", 3},
	}

	for _, tt := range tests {
		cc := NewCanaryConfig(tt.csv)
		if cc.Count() != tt.expected {
			t.Errorf("csv=%q: expected count=%d, got=%d", tt.csv, tt.expected, cc.Count())
		}
	}
}

func TestParseCanaryPairsFromEnv(t *testing.T) {
	result := ParseCanaryPairsFromEnv()
	if len(result) != 0 {
		t.Errorf("expected empty map, got %d pairs", len(result))
	}
}

func TestCanaryConfig_ConcurrentAccess(t *testing.T) {
	cc := NewCanaryConfig("BTC/USDT")

	done := make(chan bool)
	for i := 0; i < 100; i++ {
		go func(idx int) {
			if idx%2 == 0 {
				cc.IsEnabled("BTC/USDT")
			} else {
				cc.List()
			}
			done <- true
		}(i)
	}

	for i := 0; i < 100; i++ {
		<-done
	}
}

func TestCanaryConfig_ConcurrentSetPairs(t *testing.T) {
	cc := NewCanaryConfig("")

	pairs := []string{"BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT"}

	done := make(chan bool)
	for _, p := range pairs {
		go func(pair string) {
			cc.SetPairs(pair)
			done <- true
		}(p)
	}

	for range pairs {
		<-done
	}

	// All pairs should be set (last one wins)
	if cc.Count() != 1 {
		t.Errorf("expected 1 pair, got %d", cc.Count())
	}
}
