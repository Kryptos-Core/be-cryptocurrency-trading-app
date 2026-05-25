package persistence

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ShadowRepository handles shadow_matching_runs table operations.
type ShadowRepository struct {
	pool *pgxpool.Pool
}

// NewShadowRepository creates a new ShadowRepository.
func NewShadowRepository(pool *pgxpool.Pool) *ShadowRepository {
	return &ShadowRepository{pool: pool}
}

// ShadowRunRecord represents a shadow run record from the database.
type ShadowRunRecord struct {
	RunID     string
	PairID    string
	OrderID   string
	Mode      string
	Status    string
	Payload   []byte
	CreatedAt time.Time
}

// Insert adds a shadow run record without result payload.
func (r *ShadowRepository) Insert(ctx context.Context, runID, pairID, orderID, mode, status string, payload []byte) error {
	const query = `
		INSERT INTO shadow_matching_runs (run_id, pair_id, order_id, mode, status, payload, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (run_id) DO NOTHING
	`
	_, err := r.pool.Exec(ctx, query, runID, pairID, orderID, mode, status, payload)
	if err != nil {
		return fmt.Errorf("shadow_repo insert: %w", err)
	}
	return nil
}

// InsertWithResult inserts a shadow run with its result (for completed runs).
func (r *ShadowRepository) InsertWithResult(ctx context.Context, runID, pairID, orderID, mode, status string, resultJSON []byte) error {
	const query = `
		INSERT INTO shadow_matching_runs (run_id, pair_id, order_id, mode, status, payload, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (run_id) DO UPDATE SET
			status = EXCLUDED.status,
			payload = EXCLUDED.payload
	`
	_, err := r.pool.Exec(ctx, query, runID, pairID, orderID, mode, status, resultJSON)
	if err != nil {
		return fmt.Errorf("shadow_repo insert_with_result: %w", err)
	}
	return nil
}

// GetUnmatched returns shadow runs that don't have a corresponding trade within the time window.
// A run is considered unmatched if its order_id has no entry in the trades table.
func (r *ShadowRepository) GetUnmatched(ctx context.Context, pairID string, since time.Time, limit int) ([]*ShadowRunRecord, error) {
	const query = `
		SELECT 
			smr.run_id,
			smr.pair_id,
			smr.order_id,
			smr.mode,
			smr.status,
			smr.payload,
			smr.created_at
		FROM shadow_matching_runs smr
		LEFT JOIN trades t ON t.taker_order_id = smr.order_id OR t.maker_order_id = smr.order_id
		WHERE smr.pair_id = $1
			AND smr.created_at >= $2
			AND t.trade_id IS NULL
		ORDER BY smr.created_at DESC
		LIMIT $3
	`
	rows, err := r.pool.Query(ctx, query, pairID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("shadow_repo get_unmatched: %w", err)
	}
	defer rows.Close()

	return scanShadowRunRecords(rows)
}

// GetRecentByPair returns recent shadow runs for a pair.
func (r *ShadowRepository) GetRecentByPair(ctx context.Context, pairID string, since time.Time, limit int) ([]*ShadowRunRecord, error) {
	const query = `
		SELECT run_id, pair_id, order_id, mode, status, payload, created_at
		FROM shadow_matching_runs
		WHERE pair_id = $1 AND created_at >= $2
		ORDER BY created_at DESC
		LIMIT $3
	`
	rows, err := r.pool.Query(ctx, query, pairID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("shadow_repo get_recent: %w", err)
	}
	defer rows.Close()

	var records []*ShadowRunRecord
	for rows.Next() {
		var rec ShadowRunRecord
		err := rows.Scan(
			&rec.RunID,
			&rec.PairID,
			&rec.OrderID,
			&rec.Mode,
			&rec.Status,
			&rec.Payload,
			&rec.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("shadow_repo scan row: %w", err)
		}
		records = append(records, &rec)
	}

	return records, rows.Err()
}

// CountByStatus returns counts grouped by status for a pair within a time window.
func (r *ShadowRepository) CountByStatus(ctx context.Context, pairID string, since time.Time) (map[string]int, error) {
	const query = `
		SELECT status, COUNT(*) as cnt
		FROM shadow_matching_runs
		WHERE pair_id = $1 AND created_at >= $2
		GROUP BY status
	`
	rows, err := r.pool.Query(ctx, query, pairID, since)
	if err != nil {
		return nil, fmt.Errorf("shadow_repo count_by_status: %w", err)
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, fmt.Errorf("shadow_repo scan count: %w", err)
		}
		counts[status] = count
	}

	return counts, rows.Err()
}

// ParseShadowRunRecord parses a ShadowRunRecord's payload into a ShadowRun struct.
func ParseShadowRunRecord(rec *ShadowRunRecord) (*ShadowRunRecord, error) {
	// Payload is already parsed, this is a placeholder for compatibility
	return rec, nil
}

// ShadowRunRecordToJSON converts a ShadowRunRecord to JSON for API responses.
func ShadowRunRecordToJSON(rec *ShadowRunRecord) ([]byte, error) {
	type RecordJSON struct {
		RunID     string    `json:"run_id"`
		PairID    string    `json:"pair_id"`
		OrderID   string    `json:"order_id"`
		Mode      string    `json:"mode"`
		Status    string    `json:"status"`
		Payload   any       `json:"payload,omitempty"`
		CreatedAt time.Time `json:"created_at"`
	}

	var payload any
	if rec.Payload != nil {
		_ = json.Unmarshal(rec.Payload, &payload)
	}

	recJSON := RecordJSON{
		RunID:     rec.RunID,
		PairID:    rec.PairID,
		OrderID:   rec.OrderID,
		Mode:      rec.Mode,
		Status:    rec.Status,
		Payload:   payload,
		CreatedAt: rec.CreatedAt,
	}

	return json.Marshal(recJSON)
}

// scanShadowRunRecords scans rows into ShadowRunRecord slice.
func scanShadowRunRecords(rows pgx.Rows) ([]*ShadowRunRecord, error) {
	var records []*ShadowRunRecord
	for rows.Next() {
		var rec ShadowRunRecord
		err := rows.Scan(
			&rec.RunID,
			&rec.PairID,
			&rec.OrderID,
			&rec.Mode,
			&rec.Status,
			&rec.Payload,
			&rec.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("shadow_repo scan row: %w", err)
		}
		records = append(records, &rec)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("shadow_repo rows error: %w", err)
	}

	return records, nil
}
