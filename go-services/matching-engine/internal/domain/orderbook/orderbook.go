package orderbook

import (
	"container/heap"
	"errors"
	"math/big"
	"sync"

	"github.com/kryptos/go-services/matching-engine/internal/domain"
)

var (
	ErrOrderNotFound = errors.New("order not found")
	ErrInvalidOrder  = errors.New("invalid order")
)

type OrderBook struct {
	mu         sync.RWMutex
	pairID     string
	buyOrders  *OrderQueue
	sellOrders *OrderQueue
	ordersByID map[string]*domain.Order
}

func NewOrderBook(pairID string) *OrderBook {
	return &OrderBook{
		pairID:     pairID,
		buyOrders:  NewBuyOrderQueue(),
		sellOrders: NewSellOrderQueue(),
		ordersByID: make(map[string]*domain.Order),
	}
}

func (ob *OrderBook) PairID() string {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.pairID
}

func (ob *OrderBook) AddOrder(order *domain.Order) error {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	if order == nil || order.OrderID == "" {
		return ErrInvalidOrder
	}

	if _, exists := ob.ordersByID[order.OrderID]; exists {
		return ErrInvalidOrder
	}

	ob.ordersByID[order.OrderID] = order

	switch order.Side {
	case domain.SideBuy:
		ob.buyOrders.Push(order)
	case domain.SideSell:
		ob.sellOrders.Push(order)
	}

	return nil
}

func (ob *OrderBook) CancelOrder(orderID string) error {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	order, exists := ob.ordersByID[orderID]
	if !exists {
		return ErrOrderNotFound
	}

	order.Status = domain.StatusCancelled
	delete(ob.ordersByID, orderID)

	return nil
}

func (ob *OrderBook) GetTopBuy() *domain.Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.buyOrders.Peek()
}

func (ob *OrderBook) GetTopSell() *domain.Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.sellOrders.Peek()
}

func (ob *OrderBook) GetOrder(orderID string) *domain.Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.ordersByID[orderID]
}

func (ob *OrderBook) Size() (buys, sells int) {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.buyOrders.Len(), ob.sellOrders.Len()
}

func (ob *OrderBook) GetDepth(levels int) (bids, asks []domain.PriceLevel) {
	ob.mu.RLock()
	defer ob.mu.RUnlock()

	bids = ob.aggregateLevels(ob.buyOrders.orders, levels)
	asks = ob.aggregateLevels(ob.sellOrders.orders, levels)

	return bids, asks
}

func (ob *OrderBook) aggregateLevels(orders []*domain.Order, levels int) []domain.PriceLevel {
	if levels <= 0 || len(orders) == 0 {
		return nil
	}

	var levelsResult []domain.PriceLevel
	currentLevel := 0
	var currentPrice *big.Int
	var currentAmount *big.Int = new(big.Int)
	var count int

	for _, order := range orders {
		if currentLevel >= levels {
			break
		}

		price := order.Price
		if price == nil {
			continue
		}

		if currentPrice == nil || price.Cmp(currentPrice) != 0 {
			if currentPrice != nil {
				levelsResult = append(levelsResult, domain.NewPriceLevel(currentPrice, currentAmount, count))
				currentLevel++
				if currentLevel >= levels {
					break
				}
			}
			currentPrice = price
			currentAmount = new(big.Int).Set(&order.Remaining)
			count = 1
		} else {
			currentAmount.Add(currentAmount, &order.Remaining)
			count++
		}
	}

	if currentPrice != nil && currentLevel < levels {
		levelsResult = append(levelsResult, domain.NewPriceLevel(currentPrice, currentAmount, count))
	}

	return levelsResult
}

func (ob *OrderBook) GetBuyOrders() []*domain.Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.buyOrders.GetAll()
}

func (ob *OrderBook) GetSellOrders() []*domain.Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.sellOrders.GetAll()
}

func (ob *OrderBook) RemoveOrder(orderID string) error {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	order, exists := ob.ordersByID[orderID]
	if !exists {
		return ErrOrderNotFound
	}

	orders := ob.buyOrders.orders
	if order.Side == domain.SideSell {
		orders = ob.sellOrders.orders
	}

	for i, o := range orders {
		if o.OrderID == orderID {
			heap.Remove(ob.buyOrders, i)
			break
		}
	}

	delete(ob.ordersByID, orderID)
	return nil
}

func (ob *OrderBook) UpdateOrder(order *domain.Order) error {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	existing, exists := ob.ordersByID[order.OrderID]
	if !exists {
		return ErrOrderNotFound
	}

	if order.Status == domain.StatusFilled || order.Status == domain.StatusCancelled {
		delete(ob.ordersByID, order.OrderID)
		_ = existing
		return nil
	}

	existing.FilledAmount = order.FilledAmount
	existing.Remaining = order.Remaining
	existing.Status = order.Status

	return nil
}
