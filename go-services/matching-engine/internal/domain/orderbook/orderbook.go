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
	ob.removeFromQueue(order)

	return nil
}

func (ob *OrderBook) GetTopBuy() *domain.Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.peekActive(ob.buyOrders.orders)
}

func (ob *OrderBook) GetTopSell() *domain.Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.peekActive(ob.sellOrders.orders)
}

func (ob *OrderBook) peekActive(orders []*domain.Order) *domain.Order {
	for _, order := range orders {
		if order != nil && !order.IsFilled() && order.Status != domain.StatusCancelled {
			return order
		}
	}
	return nil
}

func (ob *OrderBook) GetOrder(orderID string) *domain.Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.ordersByID[orderID]
}

func (ob *OrderBook) Size() (buys, sells int) {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.countActive(ob.buyOrders.orders), ob.countActive(ob.sellOrders.orders)
}

func (ob *OrderBook) countActive(orders []*domain.Order) int {
	count := 0
	for _, order := range orders {
		if order != nil && !order.IsFilled() && order.Status != domain.StatusCancelled {
			count++
		}
	}
	return count
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
	return ob.activeOrders(ob.buyOrders.GetAll())
}

func (ob *OrderBook) GetSellOrders() []*domain.Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.activeOrders(ob.sellOrders.GetAll())
}

func (ob *OrderBook) activeOrders(orders []*domain.Order) []*domain.Order {
	active := orders[:0]
	for _, order := range orders {
		if order != nil && !order.IsFilled() && order.Status != domain.StatusCancelled {
			active = append(active, order)
		}
	}
	return active
}

func (ob *OrderBook) RemoveOrder(orderID string) error {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	order, exists := ob.ordersByID[orderID]
	if !exists {
		return ErrOrderNotFound
	}

	ob.removeFromQueue(order)
	delete(ob.ordersByID, orderID)
	return nil
}

func (ob *OrderBook) removeFromQueue(order *domain.Order) {
	queue := ob.buyOrders
	if order.Side == domain.SideSell {
		queue = ob.sellOrders
	}

	for i, o := range queue.orders {
		if o.OrderID == order.OrderID {
			heap.Remove(queue, i)
			break
		}
	}
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
