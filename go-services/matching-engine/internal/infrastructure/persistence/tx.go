package persistence

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WithTransaction executes fn within a database transaction.
// Isolation level: SERIALIZABLE (or READ COMMITTED with explicit row locks).
// On fn error, rolls back. On fn success, commits.
func WithTransaction(ctx context.Context, pool *pgxpool.Pool, fn func(tx pgx.Tx) error) error {
	// Acquire connection from pool
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("failed to acquire connection from pool: %w", err)
	}
	defer conn.Release()

	// Begin transaction with SERIALIZABLE isolation
	tx, err := conn.BeginTx(ctx, pgx.TxOptions{
		IsoLevel: pgx.Serializable,
	})
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	// Execute the provided function
	if err := fn(tx); err != nil {
		// Rollback on error
		rbErr := tx.Rollback(ctx)
		if rbErr != nil {
			return fmt.Errorf("transaction failed: %w (rollback also failed: %v)", err, rbErr)
		}
		return fmt.Errorf("transaction rolled back: %w", err)
	}

	// Commit on success
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// WithReadCommittedTransaction executes fn within a READ COMMITTED transaction.
// This is faster than SERIALIZABLE but requires explicit FOR UPDATE locks on rows
// that need to be modified atomically.
func WithReadCommittedTransaction(ctx context.Context, pool *pgxpool.Pool, fn func(tx pgx.Tx) error) error {
	// Acquire connection from pool
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("failed to acquire connection from pool: %w", err)
	}
	defer conn.Release()

	// Begin transaction with READ COMMITTED isolation (default)
	tx, err := conn.BeginTx(ctx, pgx.TxOptions{
		IsoLevel: pgx.ReadCommitted,
	})
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	// Execute the provided function
	if err := fn(tx); err != nil {
		// Rollback on error
		rbErr := tx.Rollback(ctx)
		if rbErr != nil {
			return fmt.Errorf("transaction failed: %w (rollback also failed: %v)", err, rbErr)
		}
		return fmt.Errorf("transaction rolled back: %w", err)
	}

	// Commit on success
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}
