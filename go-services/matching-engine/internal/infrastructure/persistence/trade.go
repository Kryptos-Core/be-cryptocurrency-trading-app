package persistence

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Trade represents a matched trade in the database.
type Trade struct {
	TradeID      string
	PairID       string
	TakerOrderID string
	MakerOrderID string
	Price        string
	Amount       string
	TakerFee     string
	MakerFee     string
	FeeCurrencyID string
	CreatedAt    time.Time
}

// WalletLedger represents a wallet balance change entry.
type WalletLedger struct {
	LedgerID     string
	UserID       string
	CurrencyID   string
	WalletID     string
	RefType      string // 'TRADE'
	RefID        string // trade ID
	Direction    string // 'CREDIT' or 'DEBIT'
	Amount       string
	BalanceAfter string
}

// IntegrationOutbox represents an outbox entry for async event publishing.
type IntegrationOutbox struct {
	ID            string
	AggregateType string
	AggregateID   string
	EventType     string
	Payload       string // JSON string
	OccurredAt    time.Time
	DedupeKey     string
	KafkaTopic    string
}

// Repository handles database operations for trades, wallets, and outbox.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new Repository.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// InsertTrade inserts a new trade within a transaction.
func (r *Repository) InsertTrade(ctx context.Context, tx pgx.Tx, trade *Trade) error {
	query := `
		INSERT INTO trades (trade_id, pair_id, taker_order_id, maker_order_id, price, amount, taker_fee, maker_fee, fee_currency_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`

	var err error
	if tx != nil {
		_, err = tx.Exec(ctx, query,
			trade.TradeID,
			trade.PairID,
			trade.TakerOrderID,
			trade.MakerOrderID,
			trade.Price,
			trade.Amount,
			trade.TakerFee,
			trade.MakerFee,
			trade.FeeCurrencyID,
			trade.CreatedAt,
		)
	} else {
		_, err = r.pool.Exec(ctx, query,
			trade.TradeID,
			trade.PairID,
			trade.TakerOrderID,
			trade.MakerOrderID,
			trade.Price,
			trade.Amount,
			trade.TakerFee,
			trade.MakerFee,
			trade.FeeCurrencyID,
			trade.CreatedAt,
		)
	}

	if err != nil {
		return fmt.Errorf("failed to insert trade: %w", err)
	}

	return nil
}

// InsertWalletLedger inserts ledger entries. Call 4 times per trade:
//  1. Maker CREDIT (gets base currency, amount - maker_fee)
//  2. Maker DEBIT (pays quote currency, price * amount)
//  3. Taker CREDIT (gets quote currency, (price * amount) - taker_fee)
//  4. Taker DEBIT (pays base currency, amount)
func (r *Repository) InsertWalletLedger(ctx context.Context, tx pgx.Tx, entry *WalletLedger) error {
	query := `
		INSERT INTO wallet_ledger (ledger_id, user_id, currency_id, wallet_id, ref_type, ref_id, direction, amount, balance_after, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
	`

	var err error
	if tx != nil {
		_, err = tx.Exec(ctx, query,
			entry.LedgerID,
			entry.UserID,
			entry.CurrencyID,
			entry.WalletID,
			entry.RefType,
			entry.RefID,
			entry.Direction,
			entry.Amount,
			entry.BalanceAfter,
		)
	} else {
		_, err = r.pool.Exec(ctx, query,
			entry.LedgerID,
			entry.UserID,
			entry.CurrencyID,
			entry.WalletID,
			entry.RefType,
			entry.RefID,
			entry.Direction,
			entry.Amount,
			entry.BalanceAfter,
		)
	}

	if err != nil {
		return fmt.Errorf("failed to insert wallet ledger: %w", err)
	}

	return nil
}

// InsertOutbox inserts an integration outbox entry for Kafka publishing.
func (r *Repository) InsertOutbox(ctx context.Context, tx pgx.Tx, entry *IntegrationOutbox) error {
	query := `
		INSERT INTO integration_outbox (id, aggregate_type, aggregate_id, event_type, payload, occurred_at, dedupe_key, kafka_topic, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
	`

	var err error
	if tx != nil {
		_, err = tx.Exec(ctx, query,
			entry.ID,
			entry.AggregateType,
			entry.AggregateID,
			entry.EventType,
			entry.Payload,
			entry.OccurredAt,
			entry.DedupeKey,
			entry.KafkaTopic,
		)
	} else {
		_, err = r.pool.Exec(ctx, query,
			entry.ID,
			entry.AggregateType,
			entry.AggregateID,
			entry.EventType,
			entry.Payload,
			entry.OccurredAt,
			entry.DedupeKey,
			entry.KafkaTopic,
		)
	}

	if err != nil {
		return fmt.Errorf("failed to insert outbox entry: %w", err)
	}

	return nil
}

// FetchWalletsByUsers fetches wallets for given users with FOR UPDATE lock.
// Returns map[userID]map[currencyID]WalletBalance
func (r *Repository) FetchWalletsByUsers(ctx context.Context, tx pgx.Tx, userIDs []string, currencyIDs []string) (map[string]map[string]*WalletBalance, error) {
	if len(userIDs) == 0 || len(currencyIDs) == 0 {
		return make(map[string]map[string]*WalletBalance), nil
	}

	userPlaceholders := make([]string, len(userIDs))
	userArgs := make([]any, len(userIDs))
	for i, id := range userIDs {
		userPlaceholders[i] = fmt.Sprintf("$%d", i+1)
		userArgs[i] = id
	}

	currencyPlaceholders := make([]string, len(currencyIDs))
	currencyArgs := make([]any, len(currencyIDs))
	for i, id := range currencyIDs {
		currencyPlaceholders[i] = fmt.Sprintf("$%d", len(userIDs)+i+1)
		currencyArgs[i] = id
	}

	args := append(userArgs, currencyArgs...)

	query := fmt.Sprintf(`
		SELECT user_id, currency_id, wallet_id, available, frozen
		FROM wallets
		WHERE user_id IN (%s)
		  AND currency_id IN (%s)
		FOR UPDATE
	`, strings.Join(userPlaceholders, ","), strings.Join(currencyPlaceholders, ","))

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch wallets: %w", err)
	}
	defer rows.Close()

	result := make(map[string]map[string]*WalletBalance)
	for rows.Next() {
		var wb WalletBalance
		if err := rows.Scan(&wb.UserID, &wb.CurrencyID, &wb.WalletID, &wb.Available, &wb.Frozen); err != nil {
			return nil, fmt.Errorf("failed to scan wallet row: %w", err)
		}
		if _, ok := result[wb.UserID]; !ok {
			result[wb.UserID] = make(map[string]*WalletBalance)
		}
		result[wb.UserID][wb.CurrencyID] = &wb
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating wallet rows: %w", err)
	}

	return result, nil
}

// WalletBalance holds wallet balance data.
type WalletBalance struct {
	UserID    string
	CurrencyID string
	WalletID  string
	Available string
	Frozen    string
}

// UpdateWalletBalance updates a wallet's available and frozen balance.
// Returns the new available and frozen balances after the update.
func (r *Repository) UpdateWalletBalance(ctx context.Context, tx pgx.Tx, walletID string, availableDelta, frozenDelta string) (newAvailable, newFrozen string, _ error) {
	query := `
		UPDATE wallets
		SET available = available + $1,
		    frozen = frozen + $2,
		    updated_at = NOW()
		WHERE wallet_id = $3
		RETURNING available, frozen
	`

	var err error
	if tx != nil {
		err = tx.QueryRow(ctx, query, availableDelta, frozenDelta, walletID).Scan(&newAvailable, &newFrozen)
	} else {
		err = r.pool.QueryRow(ctx, query, availableDelta, frozenDelta, walletID).Scan(&newAvailable, &newFrozen)
	}

	if err != nil {
		return "", "", fmt.Errorf("failed to update wallet balance: %w", err)
	}
	return newAvailable, newFrozen, nil
}

// FetchOrCreateWallet gets a wallet or creates it if it doesn't exist.
// Returns the wallet_id.
func (r *Repository) FetchOrCreateWallet(ctx context.Context, tx pgx.Tx, userID, currencyID string) (string, error) {
	// Try to fetch existing wallet
	query := `
		SELECT wallet_id
		FROM wallets
		WHERE user_id = $1 AND currency_id = $2
		FOR UPDATE
	`

	var walletID string
	err := tx.QueryRow(ctx, query, userID, currencyID).Scan(&walletID)
	if err == nil {
		return walletID, nil
	}
	if err != pgx.ErrNoRows {
		return "", fmt.Errorf("failed to fetch wallet: %w", err)
	}

	// Create new wallet using INSERT ... ON CONFLICT DO NOTHING
	// to handle race conditions where another request created it first.
	insertQuery := `
		INSERT INTO wallets (wallet_id, user_id, currency_id, available, frozen, updated_at)
		VALUES ($1, $2, $3, '0', '0', NOW())
		ON CONFLICT (user_id, currency_id) DO UPDATE SET wallet_id = wallets.wallet_id
		RETURNING wallet_id
	`

	newWalletID := uuid.New().String()
	err = tx.QueryRow(ctx, insertQuery, newWalletID, userID, currencyID).Scan(&walletID)
	if err != nil {
		return "", fmt.Errorf("failed to create wallet: %w", err)
	}

	return walletID, nil
}
