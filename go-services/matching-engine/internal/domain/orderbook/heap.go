package orderbook

import (
	"container/heap"

	"github.com/kryptos/go-services/matching-engine/internal/domain"
)

type OrderQueue struct {
	orders []*domain.Order
	less   func(a, b *domain.Order) bool
}

func NewOrderQueue(less func(a, b *domain.Order) bool) *OrderQueue {
	oq := &OrderQueue{
		orders: make([]*domain.Order, 0),
		less:   less,
	}
	heap.Init(oq)
	return oq
}

func (oq *OrderQueue) Len() int {
	return len(oq.orders)
}

func (oq *OrderQueue) Less(i, j int) bool {
	return oq.less(oq.orders[i], oq.orders[j])
}

func (oq *OrderQueue) Swap(i, j int) {
	oq.orders[i], oq.orders[j] = oq.orders[j], oq.orders[i]
}

func (oq *OrderQueue) Push(x any) {
	oq.orders = append(oq.orders, x.(*domain.Order))
}

func (oq *OrderQueue) Pop() any {
	n := len(oq.orders)
	if n == 0 {
		return nil
	}
	item := oq.orders[n-1]
	oq.orders[n-1] = nil
	oq.orders = oq.orders[:n-1]
	return item
}

func (oq *OrderQueue) Peek() *domain.Order {
	if len(oq.orders) == 0 {
		return nil
	}
	return oq.orders[0]
}

func (oq *OrderQueue) IsEmpty() bool {
	return len(oq.orders) == 0
}

func (oq *OrderQueue) GetAll() []*domain.Order {
	result := make([]*domain.Order, len(oq.orders))
	copy(result, oq.orders)
	return result
}

func (oq *OrderQueue) RemoveAt(index int) *domain.Order {
	if index < 0 || index >= len(oq.orders) {
		return nil
	}
	item := oq.orders[index]
	heap.Remove(oq, index)
	return item
}

func (oq *OrderQueue) UpdateAt(index int) {
	heap.Init(oq)
}

func BuyOrderLess(a, b *domain.Order) bool {
	if a.Price == nil && b.Price == nil {
		return a.CreatedAt.Before(b.CreatedAt)
	}
	if a.Price == nil {
		return false
	}
	if b.Price == nil {
		return true
	}
	if a.Price.Cmp(b.Price) != 0 {
		return a.Price.Cmp(b.Price) > 0
	}
	return a.CreatedAt.Before(b.CreatedAt)
}

func SellOrderLess(a, b *domain.Order) bool {
	if a.Price == nil && b.Price == nil {
		return a.CreatedAt.Before(b.CreatedAt)
	}
	if a.Price == nil {
		return true
	}
	if b.Price == nil {
		return false
	}
	if a.Price.Cmp(b.Price) != 0 {
		return a.Price.Cmp(b.Price) < 0
	}
	return a.CreatedAt.Before(b.CreatedAt)
}

func NewBuyOrderQueue() *OrderQueue {
	return NewOrderQueue(BuyOrderLess)
}

func NewSellOrderQueue() *OrderQueue {
	return NewOrderQueue(SellOrderLess)
}
