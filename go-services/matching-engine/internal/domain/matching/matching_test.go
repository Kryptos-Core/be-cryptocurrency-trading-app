package matching

import (
	"math/big"
	"testing"
	"time"

	"github.com/kryptos/go-services/matching-engine/internal/domain"
	"github.com/kryptos/go-services/matching-engine/internal/domain/orderbook"
)

func newTestOrder(orderID, userID, pairID string, side domain.Side, orderType domain.OrderType, price *big.Int, amount int64, tif domain.TIF) *domain.Order {
	order := domain.NewOrder(orderID, pairID, userID, side, orderType, price, *big.NewInt(amount), tif)
	return order
}

func setupOrderBookWithSellOrders() *orderbook.OrderBook {
	ob := orderbook.NewOrderBook("BTC/USDT")

	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker2", "user3", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50100), 5, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker3", "user4", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50200), 8, domain.TIFGTC))

	return ob
}

func setupOrderBookWithBuyOrders() *orderbook.OrderBook {
	ob := orderbook.NewOrderBook("BTC/USDT")

	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50200), 10, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker2", "user3", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50100), 5, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker3", "user4", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), 8, domain.TIFGTC))

	return ob
}

func TestBasicBUYTakerMatchingMultipleSELLMakers(t *testing.T) {
	ob := setupOrderBookWithSellOrders()
	strategy := NewMatchingStrategy(0)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50300), 15, domain.TIFGTC)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 2 {
		t.Fatalf("expected 2 trades, got %d", len(trades))
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0, got %s", remaining.String())
	}

	if trades[0].TakerOID != "taker1" {
		t.Errorf("expected taker OID to be taker1")
	}

	if trades[0].Price.Cmp(big.NewInt(50000)) != 0 {
		t.Errorf("expected first trade price to be 50000, got %s", trades[0].Price.String())
	}
}

func TestBasicSELLTakerMatchingMultipleBUYMakers(t *testing.T) {
	ob := setupOrderBookWithBuyOrders()
	strategy := NewMatchingStrategy(0)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(49900), 15, domain.TIFGTC)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 2 {
		t.Fatalf("expected 2 trades, got %d", len(trades))
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0, got %s", remaining.String())
	}
}

func TestMARKETBUYWithSlippageProtection(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker2", "user3", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50500), 10, domain.TIFGTC))

	strategy := NewMatchingStrategy(0.01)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeMarket, nil, 15, domain.TIFGTC)

	_, _, err := strategy.Match(taker, ob)
	if err == nil {
		t.Fatal("expected slippage error, got nil")
	}
	if err != ErrPriceDeviation {
		t.Errorf("expected ErrPriceDeviation, got %v", err)
	}
}

func TestMARKETSELLWithSlippageProtection(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker2", "user3", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(49500), 10, domain.TIFGTC))

	strategy := NewMatchingStrategy(0.01)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideSell, domain.OrderTypeMarket, nil, 15, domain.TIFGTC)

	_, _, err := strategy.Match(taker, ob)
	if err == nil {
		t.Fatal("expected slippage error, got nil")
	}
	if err != ErrPriceDeviation {
		t.Errorf("expected ErrPriceDeviation, got %v", err)
	}
}

func TestGTCPartialFill(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC))

	strategy := NewMatchingStrategy(0)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), 5, domain.TIFGTC)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 1 {
		t.Fatalf("expected 1 trade, got %d", len(trades))
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0, got %s", remaining.String())
	}

	topBuy := ob.GetTopBuy()
	if topBuy == nil {
		t.Error("expected order to remain in book")
	}
}

func TestIOCRemainderCancelled(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC))

	strategy := NewMatchingStrategy(0)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), 5, domain.TIFGTC)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 1 {
		t.Fatalf("expected 1 trade, got %d", len(trades))
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0 for IOC, got %s", remaining.String())
	}
}

func TestFOKSuccess(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker2", "user3", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50100), 10, domain.TIFGTC))

	strategy := NewMatchingStrategy(0)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50200), 15, domain.TIFFOK)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 2 {
		t.Fatalf("expected 2 trades, got %d", len(trades))
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0, got %s", remaining.String())
	}
}

func TestFOKFailureNotEnoughLiquidity(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 5, domain.TIFGTC))

	strategy := NewMatchingStrategy(0)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50200), 10, domain.TIFFOK)

	_, _, err := strategy.Match(taker, ob)
	if err != ErrFOKNotFillable {
		t.Errorf("expected ErrFOKNotFillable, got %v", err)
	}
}

func TestSelfTradePrevention(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	ob.AddOrder(newTestOrder("maker1", "user1", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker2", "user2", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50100), 10, domain.TIFGTC))

	strategy := NewMatchingStrategy(0)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50200), 15, domain.TIFGTC)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 1 {
		t.Fatalf("expected 1 trade (self-trade skipped), got %d", len(trades))
	}

	if trades[0].MakerID != "user2" {
		t.Errorf("expected maker to be user2, got %s", trades[0].MakerID)
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0, got %s", remaining.String())
	}
}

func TestSamePriceDifferentTimestampsFIFO(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")

	time.Sleep(time.Millisecond)
	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 5, domain.TIFGTC))

	time.Sleep(time.Millisecond)
	ob.AddOrder(newTestOrder("maker2", "user3", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 5, domain.TIFGTC))

	strategy := NewMatchingStrategy(0)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), 7, domain.TIFGTC)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 2 {
		t.Fatalf("expected 2 trades, got %d", len(trades))
	}

	if trades[0].MakerID != "user2" {
		t.Errorf("expected first maker to be user2 (earlier), got %s", trades[0].MakerID)
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0, got %s", remaining.String())
	}
}

func TestBigIntArithmeticLargeNumbers(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")

	largeAmount := new(big.Int).Exp(big.NewInt(10), big.NewInt(20), nil)
	largePrice := new(big.Int).Exp(big.NewInt(10), big.NewInt(8), nil)

	maker := domain.NewOrder("maker1", "BTC/USDT", "user2", domain.SideSell, domain.OrderTypeLimit, largePrice, *largeAmount, domain.TIFGTC)
	ob.AddOrder(maker)

	strategy := NewMatchingStrategy(0)

	taker := domain.NewOrder("taker1", "BTC/USDT", "user1", domain.SideBuy, domain.OrderTypeLimit, new(big.Int).Add(largePrice, big.NewInt(1)), *largeAmount, domain.TIFGTC)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 1 {
		t.Fatalf("expected 1 trade, got %d", len(trades))
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0, got %s", remaining.String())
	}

	tradeValue := new(big.Int).Mul(&trades[0].Price, &trades[0].Amount)
	if tradeValue.BitLen() < 50 {
		t.Errorf("expected large trade value, got %s", tradeValue.String())
	}
}

func TestNilTakerOrder(t *testing.T) {
	strategy := NewMatchingStrategy(0)
	ob := orderbook.NewOrderBook("BTC/USDT")

	_, _, err := strategy.Match(nil, ob)
	if err != ErrNilTaker {
		t.Errorf("expected ErrNilTaker, got %v", err)
	}
}

func TestNilBook(t *testing.T) {
	strategy := NewMatchingStrategy(0)

	_, _, err := strategy.Match(newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC), nil)
	if err != ErrNilBook {
		t.Errorf("expected ErrNilBook, got %v", err)
	}
}

func TestZeroRemainingOrder(t *testing.T) {
	strategy := NewMatchingStrategy(0)
	ob := orderbook.NewOrderBook("BTC/USDT")

	taker := domain.NewOrder("taker1", "BTC/USDT", "user1", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), *big.NewInt(0), domain.TIFGTC)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 0 {
		t.Errorf("expected 0 trades for zero remaining order, got %d", len(trades))
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0, got %s", remaining.String())
	}
}

func TestOrderBookSize(t *testing.T) {
	ob := setupOrderBookWithSellOrders()

	buys, sells := ob.Size()
	if sells != 3 {
		t.Errorf("expected 3 sell orders, got %d", sells)
	}
	if buys != 0 {
		t.Errorf("expected 0 buy orders, got %d", buys)
	}
}

func TestOrderBookCancelOrder(t *testing.T) {
	ob := setupOrderBookWithSellOrders()

	err := ob.CancelOrder("maker1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	_, sells := ob.Size()
	if sells != 2 {
		t.Errorf("expected 2 sell orders after cancel, got %d", sells)
	}

	order := ob.GetOrder("maker1")
	if order.Status != domain.StatusCancelled {
		t.Errorf("expected order status to be CANCELLED, got %s", order.Status)
	}
}

func TestOrderBookCancelNonExistentOrder(t *testing.T) {
	ob := setupOrderBookWithSellOrders()

	err := ob.CancelOrder("nonexistent")
	if err != orderbook.ErrOrderNotFound {
		t.Errorf("expected ErrOrderNotFound, got %v", err)
	}
}

func TestGetTopBuyAndSell(t *testing.T) {
	ob := setupOrderBookWithSellOrders()

	topSell := ob.GetTopSell()
	if topSell == nil {
		t.Fatal("expected top sell order")
	}
	if topSell.Price.Cmp(big.NewInt(50000)) != 0 {
		t.Errorf("expected top sell price 50000, got %s", topSell.Price.String())
	}

	topBuy := ob.GetTopBuy()
	if topBuy != nil {
		t.Error("expected nil top buy (no buy orders)")
	}
}

func TestOrderBookGetDepth(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker2", "user3", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), 5, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker3", "user4", "BTC/USDT", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50100), 8, domain.TIFGTC))

	bids, asks := ob.GetDepth(2)

	if len(bids) != 2 {
		t.Errorf("expected 2 bid levels, got %d", len(bids))
	}

	if bids[0].Price.Cmp(big.NewInt(50100)) != 0 {
		t.Errorf("expected first bid price 50100, got %s", bids[0].Price.String())
	}

	if len(asks) != 0 {
		t.Errorf("expected 0 ask levels, got %d", len(asks))
	}
}

func TestMarketOrderNoSlippageTolerance(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker2", "user3", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50100), 10, domain.TIFGTC))

	strategy := NewMatchingStrategy(0)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeMarket, nil, 15, domain.TIFGTC)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 2 {
		t.Errorf("expected 2 trades without slippage tolerance, got %d", len(trades))
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0, got %s", remaining.String())
	}
}

func TestSlippageToleranceDisabled(t *testing.T) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	ob.AddOrder(newTestOrder("maker1", "user2", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50000), 10, domain.TIFGTC))
	ob.AddOrder(newTestOrder("maker2", "user3", "BTC/USDT", domain.SideSell, domain.OrderTypeLimit, big.NewInt(50500), 10, domain.TIFGTC))

	strategy := NewMatchingStrategy(0)

	taker := newTestOrder("taker1", "user1", "BTC/USDT", domain.SideBuy, domain.OrderTypeMarket, nil, 15, domain.TIFGTC)

	trades, remaining, err := strategy.Match(taker, ob)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(trades) != 2 {
		t.Errorf("expected 2 trades with slippage disabled, got %d", len(trades))
	}

	if remaining.Sign() != 0 {
		t.Errorf("expected remaining to be 0, got %s", remaining.String())
	}
}

func TestNewMatchingStrategy(t *testing.T) {
	strategy := NewMatchingStrategy(0)
	if strategy.slippageTolerance != nil {
		t.Error("expected nil slippage tolerance for 0 percent")
	}

	strategy = NewMatchingStrategy(-1)
	if strategy.slippageTolerance != nil {
		t.Error("expected nil slippage tolerance for negative percent")
	}

	strategy = NewMatchingStrategy(0.5)
	if strategy.slippageTolerance == nil {
		t.Error("expected non-nil slippage tolerance for positive percent")
	}
}

func TestOrderStatusTransition(t *testing.T) {
	order := domain.NewOrder("test1", "BTC/USDT", "user1", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), *big.NewInt(100), domain.TIFGTC)

	if order.Status != domain.StatusOpen {
		t.Errorf("expected status OPEN, got %s", order.Status)
	}

	order.Fill(big.NewInt(50))
	if order.Status != domain.StatusPartial {
		t.Errorf("expected status PARTIAL, got %s", order.Status)
	}

	order.Fill(big.NewInt(50))
	if order.Status != domain.StatusFilled {
		t.Errorf("expected status FILLED, got %s", order.Status)
	}
}

func TestOrderMethods(t *testing.T) {
	order := domain.NewOrder("test1", "BTC/USDT", "user1", domain.SideBuy, domain.OrderTypeLimit, big.NewInt(50000), *big.NewInt(100), domain.TIFGTC)

	if !order.IsBuy() {
		t.Error("expected IsBuy to return true")
	}

	if order.IsMarket() {
		t.Error("expected IsMarket to return false for LIMIT order")
	}

	order.Type = domain.OrderTypeMarket
	if !order.IsMarket() {
		t.Error("expected IsMarket to return true for MARKET order")
	}
}

func TestTradeCreation(t *testing.T) {
	trade := domain.NewTrade(
		"trade1",
		"BTC/USDT",
		"maker1",
		"taker1",
		"makerOID1",
		"takerOID1",
		big.NewInt(50000),
		big.NewInt(10),
		big.NewInt(25),
		big.NewInt(25),
	)

	if trade.TradeID != "trade1" {
		t.Errorf("expected TradeID trade1, got %s", trade.TradeID)
	}

	if trade.PairID != "BTC/USDT" {
		t.Errorf("expected PairID BTC/USDT, got %s", trade.PairID)
	}

	if trade.MakerID != "maker1" {
		t.Errorf("expected MakerID maker1, got %s", trade.MakerID)
	}
}

func TestPriceLevelCreation(t *testing.T) {
	pl := domain.NewPriceLevel(big.NewInt(50000), big.NewInt(100), 5)

	if pl.Price.Cmp(big.NewInt(50000)) != 0 {
		t.Errorf("expected Price 50000, got %s", pl.Price.String())
	}

	if pl.Amount.Cmp(big.NewInt(100)) != 0 {
		t.Errorf("expected Amount 100, got %s", pl.Amount.String())
	}

	if pl.Count != 5 {
		t.Errorf("expected Count 5, got %d", pl.Count)
	}
}
