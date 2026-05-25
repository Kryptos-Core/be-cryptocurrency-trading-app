package canary

import (
	"os"
	"strings"
	"sync"
)

// CanaryConfig manages which pairs are in canary mode.
// In canary mode, orders are executed but results are compared against shadow runs.
type CanaryConfig struct {
	mu    sync.RWMutex
	pairs map[string]bool
}

// NewCanaryConfig creates a new CanaryConfig from a CSV string of pair IDs.
func NewCanaryConfig(pairsCSV string) *CanaryConfig {
	cc := &CanaryConfig{
		pairs: make(map[string]bool),
	}
	cc.SetPairs(pairsCSV)
	return cc
}

// IsEnabled returns true if the given pair ID is in canary mode.
func (c *CanaryConfig) IsEnabled(pairID string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.pairs[pairID]
}

// SetPairs updates the set of canary pairs from a CSV string.
func (c *CanaryConfig) SetPairs(pairsCSV string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.pairs = make(map[string]bool)
	if pairsCSV == "" {
		return
	}
	for _, pair := range strings.Split(pairsCSV, ",") {
		pair = strings.TrimSpace(pair)
		if pair != "" {
			c.pairs[pair] = true
		}
	}
}

// List returns all canary pair IDs.
func (c *CanaryConfig) List() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	result := make([]string, 0, len(c.pairs))
	for pair := range c.pairs {
		result = append(result, pair)
	}
	return result
}

// Count returns the number of pairs in canary mode.
func (c *CanaryConfig) Count() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.pairs)
}

// ParseCanaryPairsFromEnv reads MATCHING_GO_CANARY_PAIRS env var,
// splits by comma, and returns a map of pair IDs.
func ParseCanaryPairsFromEnv() map[string]bool {
	pairsCSV := os.Getenv("MATCHING_GO_CANARY_PAIRS")
	result := make(map[string]bool)
	if pairsCSV == "" {
		return result
	}
	for _, pair := range strings.Split(pairsCSV, ",") {
		pair = strings.TrimSpace(pair)
		if pair != "" {
			result[pair] = true
		}
	}
	return result
}
