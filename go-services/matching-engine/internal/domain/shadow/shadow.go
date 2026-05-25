package shadow

import (
	"encoding/json"
	"time"
)

const (
	StatusPending   = "pending"
	StatusCompleted = "completed"
	StatusSkipped   = "skipped"
	StatusError     = "error"
)

const (
	ModeGoShadow  = "go_shadow"
	ModeGoCanary  = "go_canary"
	ModeGo        = "go"
)

// ShadowRun represents a shadow matching execution record.
type ShadowRun struct {
	RunID     string        `json:"run_id"`
	PairID    string        `json:"pair_id"`
	OrderID   string        `json:"order_id"`
	Mode      string        `json:"mode"`
	Status    string        `json:"status"`
	Result    *ShadowResult `json:"result,omitempty"`
	CreatedAt time.Time     `json:"created_at"`
}

// ShadowResult holds the outcome of a shadow matching run.
type ShadowResult struct {
	Fills      []ShadowFill `json:"fills,omitempty"`
	ErrorMsg   string       `json:"error_msg,omitempty"`
	MatchRate  float64      `json:"match_rate,omitempty"`
	Trades     int          `json:"trades_count,omitempty"`
}

// ShadowFill represents a fill in shadow mode.
type ShadowFill struct {
	MakerOrderID string `json:"maker_order_id"`
	Price        string `json:"price"`
	Amount       string `json:"amount"`
	MakerFee     string `json:"maker_fee"`
	TakerFee     string `json:"taker_fee"`
}

// ToJSON serializes the ShadowRun to JSON.
func (s *ShadowRun) ToJSON() ([]byte, error) {
	return json.Marshal(s)
}

// ShadowRunFromJSON deserializes a ShadowRun from JSON.
func ShadowRunFromJSON(data []byte) (*ShadowRun, error) {
	var run ShadowRun
	if err := json.Unmarshal(data, &run); err != nil {
		return nil, err
	}
	return &run, nil
}

// ResultToJSON serializes the ShadowResult to JSON.
func (r *ShadowResult) ToJSON() ([]byte, error) {
	return json.Marshal(r)
}

// ShadowResultFromJSON deserializes a ShadowResult from JSON.
func ShadowResultFromJSON(data []byte) (*ShadowResult, error) {
	var result ShadowResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// NewShadowRun creates a new shadow run with default values.
func NewShadowRun(runID, pairID, orderID, mode string) *ShadowRun {
	return &ShadowRun{
		RunID:     runID,
		PairID:    pairID,
		OrderID:   orderID,
		Mode:      mode,
		Status:    StatusPending,
		CreatedAt: time.Now().UTC(),
	}
}

// MarkCompleted updates the run as completed with result.
func (s *ShadowRun) MarkCompleted(result *ShadowResult) {
	s.Status = StatusCompleted
	s.Result = result
}

// MarkSkipped marks the run as skipped (e.g., no matching needed).
func (s *ShadowRun) MarkSkipped(reason string) {
	s.Status = StatusSkipped
	s.Result = &ShadowResult{ErrorMsg: reason}
}

// MarkError marks the run as errored.
func (s *ShadowRun) MarkError(errMsg string) {
	s.Status = StatusError
	s.Result = &ShadowResult{ErrorMsg: errMsg}
}
