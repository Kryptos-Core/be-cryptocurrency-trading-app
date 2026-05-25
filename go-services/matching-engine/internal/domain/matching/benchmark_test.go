package matching

import (
	"math/big"
	"testing"
	"time"

	"github.com/kryptos/go-services/matching-engine/internal/domain"
	"github.com/kryptos/go-services/matching-engine/internal/domain/orderbook"
)

func newBenchOrder(orderID, userID, pairID string, side domain.Side, price *big.Int, amount int64) *domain.Order {
	return domain.NewOrder(orderID, pairID, userID, side, domain.OrderTypeLimit, price, *big.NewInt(amount), domain.TIFGTC)
}

// BenchmarkOrderBookAddOrders measures the performance of adding orders to the order book.
func BenchmarkOrderBookAddOrders(b *testing.B) {
	prices := make([]*big.Int, 100)
	for i := 0; i < 100; i++ {
		prices[i] = big.NewInt(int64(50000 + i))
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		ob := orderbook.NewOrderBook("BTC/USDT")
		for j := 0; j < 50; j++ {
			_ = ob.AddOrder(newBenchOrder(
				"order-"+string(rune(j)),
				"user-"+string(rune(j%10)),
				"BTC/USDT",
				domain.SideBuy,
				prices[j%len(prices)],
				int64(10+j%5),
			))
		}
	}
}

// BenchmarkOrderBookCancel measures the performance of cancelling orders.
func BenchmarkOrderBookCancel(b *testing.B) {
	b.StopTimer()
	ob := orderbook.NewOrderBook("BTC/USDT")
	orderIDs := make([]string, 100)
	for i := 0; i < 100; i++ {
		orderID := "order-" + string(rune(i))
		orderIDs[i] = orderID
		_ = ob.AddOrder(newBenchOrder(
			orderID,
			"user-"+string(rune(i%10)),
			"BTC/USDT",
			domain.SideBuy,
			big.NewInt(int64(50000+i)),
			10,
		))
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		idx := i % len(orderIDs)
		_ = ob.CancelOrder(orderIDs[idx])
	}
}

// BenchmarkOrderBookMatching100Orders measures matching performance with 100 orders in the book.
func BenchmarkOrderBookMatching100Orders(b *testing.B) {
	b.StopTimer()
	prices := make([]*big.Int, 100)
	for i := 0; i < 100; i++ {
		prices[i] = big.NewInt(int64(50000 + i))
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		ob := orderbook.NewOrderBook("BTC/USDT")
		for j := 0; j < 100; j++ {
			_ = ob.AddOrder(newBenchOrder(
				"maker-"+string(rune(j)),
				"maker-user-"+string(rune(j)),
				"BTC/USDT",
				domain.SideSell,
				prices[j],
				10,
			))
		}

		taker := newBenchOrder(
			"taker",
			"taker-user",
			"BTC/USDT",
			domain.SideBuy,
			big.NewInt(51000),
			500,
		)
		strategy := NewMatchingStrategy(0)

		b.StartTimer()
		_, _, _ = strategy.Match(taker, ob)
		b.StopTimer()
	}
}

// BenchmarkMatchingThroughput measures how many orders can be matched per second.
func BenchmarkMatchingThroughput(b *testing.B) {
	b.StopTimer()
	// Setup order book with 50 sell orders
	ob := orderbook.NewOrderBook("BTC/USDT")
	for i := 0; i < 50; i++ {
		_ = ob.AddOrder(newBenchOrder(
			"maker-"+string(rune(i)),
			"maker-user-"+string(rune(i)),
			"BTC/USDT",
			domain.SideSell,
			big.NewInt(int64(50000+i*10)),
			10,
		))
	}
	strategy := NewMatchingStrategy(0)

	b.ResetTimer()
	b.ReportAllocs()

	orderCounter := 0
	for i := 0; i < b.N; i++ {
		taker := newBenchOrder(
			"taker-"+string(rune(i)),
			"taker-user",
			"BTC/USDT",
			domain.SideBuy,
			big.NewInt(50500),
			100,
		)
		_, _, _ = strategy.Match(taker, ob)
		orderCounter++
	}
	b.Logf("Throughput: %d orders/second", orderCounter)
}

// BenchmarkMatchingFIFO measures FIFO ordering at same price level.
func BenchmarkMatchingFIFO(b *testing.B) {
	b.StopTimer()
	ob := orderbook.NewOrderBook("BTC/USDT")
	// Add 100 orders at the same price (different users for FIFO)
	for i := 0; i < 100; i++ {
		_ = ob.AddOrder(newBenchOrder(
			"maker-"+string(rune(i)),
			"user-"+string(rune(i)),
			"BTC/USDT",
			domain.SideSell,
			big.NewInt(50000),
			1,
		))
		time.Sleep(time.Microsecond) // Ensure different timestamps
	}
	strategy := NewMatchingStrategy(0)
	taker := newBenchOrder("taker", "taker-user", "BTC/USDT", domain.SideBuy, big.NewInt(50000), 100)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_, _, _ = strategy.Match(taker, ob)
	}
}

// BenchmarkMatchingConcurrent measures concurrent matching operations.
func BenchmarkMatchingConcurrent(b *testing.B) {
	b.StopTimer()
	pairs := []string{"BTC/USDT", "ETH/USDT", "SOL/USDT"}
	pairOBs := make(map[string]*orderbook.OrderBook)

	for _, pair := range pairs {
		ob := orderbook.NewOrderBook(pair)
		for j := 0; j < 50; j++ {
			_ = ob.AddOrder(domain.NewOrder(
				pair+"-maker-"+string(rune(j)),
				pair, "maker-user-"+string(rune(j)),
				domain.SideSell,
				domain.OrderTypeLimit,
				big.NewInt(int64(50000+j*10)),
				*big.NewInt(10),
				domain.TIFGTC,
			))
		}
		pairOBs[pair] = ob
	}
	strategy := NewMatchingStrategy(0)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		pair := pairs[i%len(pairs)]
		ob := pairOBs[pair]
		taker := domain.NewOrder(
			pair+"-taker-"+string(rune(i)),
			pair, "taker-user",
			domain.SideBuy,
			domain.OrderTypeLimit,
			big.NewInt(50500),
			*big.NewInt(100),
			domain.TIFGTC,
		)
		_, _, _ = strategy.Match(taker, ob)
	}
}

// BenchmarkOrderBookGetDepth measures order book depth aggregation.
func BenchmarkOrderBookGetDepth(b *testing.B) {
	b.StopTimer()
	ob := orderbook.NewOrderBook("BTC/USDT")
	// Add 100 orders at various prices
	for i := 0; i < 100; i++ {
		side := domain.SideBuy
		if i%2 == 0 {
			side = domain.SideSell
		}
		_ = ob.AddOrder(newBenchOrder(
			"order-"+string(rune(i)),
			"user-"+string(rune(i)),
			"BTC/USDT",
			side,
			big.NewInt(int64(50000+(i/2)*10)),
			int64(10+i%5),
		))
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_, _ = ob.GetDepth(10)
	}
}

// BenchmarkMatchingGTCFOKIOC compares performance across TIF modes.
func BenchmarkMatchingGTCFOKIOC(b *testing.B) {
	b.StopTimer()
	ob := orderbook.NewOrderBook("BTC/USDT")
	for i := 0; i < 50; i++ {
		_ = ob.AddOrder(newBenchOrder(
			"maker-"+string(rune(i)),
			"maker-"+string(rune(i)),
			"BTC/USDT",
			domain.SideSell,
			big.NewInt(int64(50000+i*10)),
			10,
		))
	}

	b.ResetTimer()
	b.ReportAllocs()

	b.Run("GTC", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			taker := domain.NewOrder(
				"taker-"+string(rune(i)),
				"BTC/USDT", "taker-user",
				domain.SideBuy, domain.OrderTypeLimit,
				big.NewInt(50500), *big.NewInt(200), domain.TIFGTC,
			)
			strategy := NewMatchingStrategy(0)
			_, _, _ = strategy.Match(taker, ob)
		}
	})

	b.Run("IOC", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			taker := domain.NewOrder(
				"taker-"+string(rune(i)),
				"BTC/USDT", "taker-user",
				domain.SideBuy, domain.OrderTypeLimit,
				big.NewInt(50500), *big.NewInt(200), domain.TIFIOC,
			)
			strategy := NewMatchingStrategy(0)
			_, _, _ = strategy.Match(taker, ob)
		}
	})

	b.Run("FOK", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			taker := domain.NewOrder(
				"taker-"+string(rune(i)),
				"BTC/USDT", "taker-user",
				domain.SideBuy, domain.OrderTypeLimit,
				big.NewInt(50500), *big.NewInt(200), domain.TIFFOK,
			)
			strategy := NewMatchingStrategy(0)
			_, _, _ = strategy.Match(taker, ob)
		}
	})
}

// BenchmarkMatchingSlippageProtection measures overhead of slippage protection.
func BenchmarkMatchingSlippageProtection(b *testing.B) {
	b.StopTimer()
	ob := orderbook.NewOrderBook("BTC/USDT")
	for i := 0; i < 50; i++ {
		_ = ob.AddOrder(newBenchOrder(
			"maker-"+string(rune(i)),
			"maker-"+string(rune(i)),
			"BTC/USDT",
			domain.SideSell,
			big.NewInt(int64(50000+i*10)),
			10,
		))
	}

	b.ResetTimer()
	b.ReportAllocs()

	b.Run("NoSlippage", func(b *testing.B) {
		strategy := NewMatchingStrategy(0)
		for i := 0; i < b.N; i++ {
			taker := domain.NewOrder(
				"taker-"+string(rune(i)),
				"BTC/USDT", "taker-user",
				domain.SideBuy, domain.OrderTypeMarket,
				nil, *big.NewInt(200), domain.TIFGTC,
			)
			_, _, _ = strategy.Match(taker, ob)
		}
	})

	b.Run("WithSlippage", func(b *testing.B) {
		strategy := NewMatchingStrategy(0.01)
		for i := 0; i < b.N; i++ {
			taker := domain.NewOrder(
				"taker-"+string(rune(i)),
				"BTC/USDT", "taker-user",
				domain.SideBuy, domain.OrderTypeMarket,
				nil, *big.NewInt(200), domain.TIFGTC,
			)
			_, _, _ = strategy.Match(taker, ob)
		}
	})
}
