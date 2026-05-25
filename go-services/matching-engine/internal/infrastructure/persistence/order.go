package persistence

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Order represents an order from the database.
// All monetary values are stored as string (from decimal(36,18)) and parsed to big.Int.
type Order struct {
	OrderID      string
	UserID       string
	PairID       string
	Side         string
	Type         string
	Price        *string // nullable - nil for MARKET orders
	Amount       string
	FilledAmount string
	Status       string
	TIF          string
	CreatedAt    time.Time
}

// OrderRepository handles database operations for orders.
type OrderRepository struct {
	pool *pgxpool.Pool
}

// NewOrderRepository creates a new OrderRepository.
func NewOrderRepository(pool *pgxpool.Pool) *OrderRepository {
	return &OrderRepository{pool: pool}
}

// FetchOpenOrdersForPair loads all OPEN and PARTIAL orders for a trading pair,
// sorted for the order book: BUY descending by price then ascending by time,
// SELL ascending by price then ascending by time.
func (r *OrderRepository) FetchOpenOrdersForPair(ctx context.Context, pairID string) (buys []*Order, sells []*Order, err error) {
	// BUY orders: descending by price, then ascending by created_at
	buyQuery := `
		SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, status, tif, created_at
		FROM orders
		WHERE pair_id = $1 AND status IN ('OPEN', 'PARTIAL')
		  AND side = 'BUY'
		ORDER BY price DESC NULLS LAST, created_at ASC
	`

	// SELL orders: ascending by price, then ascending by created_at
	sellQuery := `
		SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, status, tif, created_at
		FROM orders
		WHERE pair_id = $1 AND status IN ('OPEN', 'PARTIAL')
		  AND side = 'SELL'
		ORDER BY price ASC NULLS LAST, created_at ASC
	`

	conn, err := r.pool.Acquire(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to acquire connection: %w", err)
	}
	defer conn.Release()

	// Fetch BUY orders
	buyRows, err := conn.Query(ctx, buyQuery, pairID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to fetch buy orders: %w", err)
	}
	defer buyRows.Close()

	buys, err = scanOrders(buyRows)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to scan buy orders: %w", err)
	}

	// Fetch SELL orders
	sellRows, err := conn.Query(ctx, sellQuery, pairID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to fetch sell orders: %w", err)
	}
	defer sellRows.Close()

	sells, err = scanOrders(sellRows)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to scan sell orders: %w", err)
	}

	return buys, sells, nil
}

// FetchOrdersByIDs loads orders by their IDs with FOR UPDATE lock.
func (r *OrderRepository) FetchOrdersByIDs(ctx context.Context, tx pgx.Tx, ids []string) ([]*Order, error) {
	if len(ids) == 0 {
		return []*Order{}, nil
	}

	// Build parameterized query with $1, $2, ... placeholders
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf(`
		SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, status, tif, created_at
		FROM orders
		WHERE order_id IN (%s)
		FOR UPDATE
	`, strings.Join(placeholders, ","))

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch orders: %w", err)
	}
	defer rows.Close()

	return scanOrders(rows)
}

// UpdateOrderFill updates an order's filled amount and status atomically.
func (r *OrderRepository) UpdateOrderFill(ctx context.Context, tx pgx.Tx, orderID string, filledAmount, avgPrice string, status string) error {
	query := `
		UPDATE orders
		SET filled_amount = $1,
		    avg_price = $2,
		    status = $3,
		    updated_at = NOW()
		WHERE order_id = $4
	`

	var result pgx.Rows
	var err error

	if tx != nil {
		result, err = tx.Query(ctx, query, filledAmount, avgPrice, status, orderID)
	} else {
		result, err = r.pool.Query(ctx, query, filledAmount, avgPrice, status, orderID)
	}

	if err != nil {
		return fmt.Errorf("failed to update order fill: %w", err)
	}
	defer result.Close()

	if result.CommandTag().RowsAffected() == 0 {
		return fmt.Errorf("order not found: %s", orderID)
	}

	return nil
}

// scanOrders scans rows into Order slice.
func scanOrders(rows pgx.Rows) ([]*Order, error) {
	var orders []*Order
	for rows.Next() {
		var order Order
		err := rows.Scan(
			&order.OrderID,
			&order.UserID,
			&order.PairID,
			&order.Side,
			&order.Type,
			&order.Price,
			&order.Amount,
			&order.FilledAmount,
			&order.Status,
			&order.TIF,
			&order.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan order row: %w", err)
		}
		orders = append(orders, &order)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating order rows: %w", err)
	}

	return orders, nil
}
