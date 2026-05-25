package app

import (
	"context"
	"fmt"
	"math/big"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kryptos/go-services/matching-engine/internal/domain"
	"github.com/kryptos/go-services/matching-engine/internal/domain/matching"
	"github.com/kryptos/go-services/matching-engine/internal/domain/orderbook"
)

// ============================================================================
// Benchmark Suite for Matching Engine Performance
// ============================================================================

// BenchmarkOrderBookAddOrder benchmarks order book add order operations.
func BenchmarkOrderBookAddOrder(b *testing.B) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	orders := generateTestOrders(1000)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		for _, order := range orders {
			_ = ob.AddOrder(order)
		}
	}
}

// BenchmarkOrderBookAddOrderSingleThreaded benchmarks single-threaded order addition.
func BenchmarkOrderBookAddOrderSingleThreaded(b *testing.B) {
	b.RunParallel(func(pb *testing.PB) {
		ob := orderbook.NewOrderBook("BTC/USDT")
		i := 0
		for pb.Next() {
			order := domain.NewOrder(
				fmt.Sprintf("order-%d", i),
				"BTC/USDT",
				fmt.Sprintf("user-%d", i%100),
				domain.SideBuy,
				domain.OrderTypeLimit,
				big.NewInt(50000+int64(i%100)),
				*big.NewInt(100),
				domain.TIFGTC,
			)
			_ = ob.AddOrder(order)
			i++
		}
	})
}

// BenchmarkOrderBookProcessMatch benchmarks the full matching process.
func BenchmarkOrderBookProcessMatch(b *testing.B) {
	ob := orderbook.NewOrderBook("BTC/USDT")

	// Setup order book with 100 orders
	for i := 0; i < 100; i++ {
		order := domain.NewOrder(
			fmt.Sprintf("maker-%d", i),
			"BTC/USDT",
			fmt.Sprintf("user-maker-%d", i),
			domain.SideSell,
			domain.OrderTypeLimit,
			big.NewInt(50000+int64(i)),
			*big.NewInt(10),
			domain.TIFGTC,
		)
		_ = ob.AddOrder(order)
	}

	strategy := matching.NewMatchingStrategy(0.0)
	taker := domain.NewOrder(
		"taker-1",
		"BTC/USDT",
		"user-taker",
		domain.SideBuy,
		domain.OrderTypeLimit,
		big.NewInt(51000),
		*big.NewInt(500),
		domain.TIFGTC,
	)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		// Create a fresh taker order
		t := *taker
		t.OrderID = fmt.Sprintf("taker-%d", i)
		_, _, _ = strategy.Match(&t, ob)
	}
}

// BenchmarkOrderBookProcessMatchWithLargeBook benchmarks matching with large order book.
func BenchmarkOrderBookProcessMatchWithLargeBook(b *testing.B) {
	ob := orderbook.NewOrderBook("BTC/USDT")

	// Setup large order book
	for i := 0; i < 1000; i++ {
		order := domain.NewOrder(
			fmt.Sprintf("maker-%d", i),
			"BTC/USDT",
			fmt.Sprintf("user-maker-%d", i),
			domain.SideSell,
			domain.OrderTypeLimit,
			big.NewInt(50000+int64(i%100)),
			*big.NewInt(10),
			domain.TIFGTC,
		)
		_ = ob.AddOrder(order)
	}

	strategy := matching.NewMatchingStrategy(0.0)
	taker := domain.NewOrder(
		"taker-1",
		"BTC/USDT",
		"user-taker",
		domain.SideBuy,
		domain.OrderTypeLimit,
		big.NewInt(50100),
		*big.NewInt(100),
		domain.TIFGTC,
	)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		t := *taker
		t.OrderID = fmt.Sprintf("taker-%d", i)
		_, _, _ = strategy.Match(&t, ob)
	}
}

// BenchmarkOrderBookCancelOrder benchmarks order cancellation.
func BenchmarkOrderBookCancelOrder(b *testing.B) {
	ob := orderbook.NewOrderBook("BTC/USDT")

	// Setup with orders
	var orderIDs []string
	for i := 0; i < 100; i++ {
		orderID := fmt.Sprintf("order-%d", i)
		orderIDs = append(orderIDs, orderID)
		order := domain.NewOrder(
			orderID,
			"BTC/USDT",
			fmt.Sprintf("user-%d", i),
			domain.SideBuy,
			domain.OrderTypeLimit,
			big.NewInt(50000+int64(i)),
			*big.NewInt(100),
			domain.TIFGTC,
		)
		_ = ob.AddOrder(order)
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = ob.CancelOrder(orderIDs[i%len(orderIDs)])
	}
}

// BenchmarkOrderBookGetDepth benchmarks getting order book depth.
func BenchmarkOrderBookGetDepth(b *testing.B) {
	ob := orderbook.NewOrderBook("BTC/USDT")

	// Setup with many orders
	for i := 0; i < 500; i++ {
		order := domain.NewOrder(
			fmt.Sprintf("buy-%d", i),
			"BTC/USDT",
			fmt.Sprintf("user-%d", i),
			domain.SideBuy,
			domain.OrderTypeLimit,
			big.NewInt(50000+int64(i%100)),
			*big.NewInt(10),
			domain.TIFGTC,
		)
		_ = ob.AddOrder(order)
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_, _ = ob.GetDepth(10)
	}
}

// BenchmarkOrderBookTopOfBook benchmarks getting top of book.
func BenchmarkOrderBookTopOfBook(b *testing.B) {
	ob := orderbook.NewOrderBook("BTC/USDT")

	// Setup with orders
	for i := 0; i < 100; i++ {
		order := domain.NewOrder(
			fmt.Sprintf("buy-%d", i),
			"BTC/USDT",
			fmt.Sprintf("user-%d", i),
			domain.SideBuy,
			domain.OrderTypeLimit,
			big.NewInt(50000+int64(i)),
			*big.NewInt(100),
			domain.TIFGTC,
		)
		_ = ob.AddOrder(order)
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = ob.GetTopBuy()
		_ = ob.GetTopSell()
	}
}

// BenchmarkConcurrentMatching benchmarks concurrent matching operations.
func BenchmarkConcurrentMatching(b *testing.B) {
	numPairs := 10
	orderBooks := make([]*orderbook.OrderBook, numPairs)
	strategies := make([]*matching.MatchingStrategy, numPairs)

	for i := 0; i < numPairs; i++ {
		orderBooks[i] = orderbook.NewOrderBook(fmt.Sprintf("PAIR-%d", i))
		strategies[i] = matching.NewMatchingStrategy(0.0)

		// Setup with maker orders
		for j := 0; j < 50; j++ {
			order := domain.NewOrder(
				fmt.Sprintf("maker-%d-%d", i, j),
				fmt.Sprintf("PAIR-%d", i),
				fmt.Sprintf("user-maker-%d", j),
				domain.SideSell,
				domain.OrderTypeLimit,
				big.NewInt(50000+int64(j)),
				*big.NewInt(100),
				domain.TIFGTC,
			)
			_ = orderBooks[i].AddOrder(order)
		}
	}

	var wg sync.WaitGroup
	var totalProcessed atomic.Int64

	b.ResetTimer()
	b.SetParallelism(runtime.NumCPU())
	b.RunParallel(func(pb *testing.PB) {
		var localProcessed int64
		i := 0
		for pb.Next() {
			pairIdx := i % numPairs
			order := domain.NewOrder(
				fmt.Sprintf("taker-%d", i),
				fmt.Sprintf("PAIR-%d", pairIdx),
				"user-taker",
				domain.SideBuy,
				domain.OrderTypeLimit,
				big.NewInt(50100),
				*big.NewInt(10),
				domain.TIFGTC,
			)
			_, _, _ = strategies[pairIdx].Match(order, orderBooks[pairIdx])
			localProcessed++
			i++
		}
		totalProcessed.Add(localProcessed)
	})

	b.ReportMetric(float64(totalProcessed.Load())/b.Elapsed().Seconds(), "orders/sec")
}

// BenchmarkThroughput1000OrdersPerSecond benchmarks 1000 orders/second throughput.
func BenchmarkThroughput1000OrdersPerSecond(b *testing.B) {
	// This benchmark simulates processing 1000 orders per second
	const targetThroughput = 1000
	const batchSize = 1000

	ob := orderbook.NewOrderBook("BTC/USDT")
	strategy := matching.NewMatchingStrategy(0.0)

	// Pre-warm
	for i := 0; i < 100; i++ {
		order := domain.NewOrder(
			fmt.Sprintf("maker-%d", i),
			"BTC/USDT",
			fmt.Sprintf("user-maker-%d", i),
			domain.SideSell,
			domain.OrderTypeLimit,
			big.NewInt(50000+int64(i)),
			*big.NewInt(100),
			domain.TIFGTC,
		)
		_ = ob.AddOrder(order)
	}

	b.ResetTimer()
	b.ReportAllocs()

	// Process in batches
	for batch := 0; batch < b.N; batch++ {
		start := time.Now()

		// Simulate 1000 orders
		for i := 0; i < batchSize; i++ {
			order := domain.NewOrder(
				fmt.Sprintf("taker-%d-%d", batch, i),
				"BTC/USDT",
				fmt.Sprintf("user-%d", i),
				domain.SideBuy,
				domain.OrderTypeLimit,
				big.NewInt(50100),
				*big.NewInt(10),
				domain.TIFGTC,
			)
			_, _, _ = strategy.Match(order, ob)
		}

		// Calculate actual throughput
		elapsed := time.Since(start)
		ordersPerSecond := float64(batchSize) / elapsed.Seconds()

		// Log if we're meeting target
		if ordersPerSecond >= float64(targetThroughput) {
			_ = ordersPerSecond // Target met
		}
	}
}

// BenchmarkMemoryUsageOrderBook benchmarks memory usage of order book.
func BenchmarkMemoryUsageOrderBook(b *testing.B) {
	b.ReportAllocs()

	var m1, m2 runtime.MemStats

	b.Run("empty", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			runtime.GC()
			runtime.ReadMemStats(&m1)

			ob := orderbook.NewOrderBook("BTC/USDT")

			runtime.ReadMemStats(&m2)
			b.ReportMetric(float64(m2.Mallocs-m1.Mallocs), "allocs/op")
		}
	})

	b.Run("100-orders", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			runtime.GC()
			runtime.ReadMemStats(&m1)

			ob := orderbook.NewOrderBook("BTC/USDT")
			for j := 0; j < 100; j++ {
				order := domain.NewOrder(
					fmt.Sprintf("order-%d", j),
					"BTC/USDT",
					fmt.Sprintf("user-%d", j),
					domain.SideBuy,
					domain.OrderTypeLimit,
					big.NewInt(50000),
					*big.NewInt(100),
					domain.TIFGTC,
				)
				_ = ob.AddOrder(order)
			}

			runtime.ReadMemStats(&m2)
			b.ReportMetric(float64(m2.Mallocs-m1.Mallocs), "allocs/op")
		}
	})

	b.Run("1000-orders", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			runtime.GC()
			runtime.ReadMemStats(&m1)

			ob := orderbook.NewOrderBook("BTC/USDT")
			for j := 0; j < 1000; j++ {
				order := domain.NewOrder(
					fmt.Sprintf("order-%d", j),
					"BTC/USDT",
					fmt.Sprintf("user-%d", j),
					domain.SideBuy,
					domain.OrderTypeLimit,
					big.NewInt(50000),
					*big.NewInt(100),
					domain.TIFGTC,
				)
				_ = ob.AddOrder(order)
			}

			runtime.ReadMemStats(&m2)
			b.ReportMetric(float64(m2.Mallocs-m1.Mallocs), "allocs/op")
		}
	})
}

// BenchmarkMultipleTradingPairs benchmarks operations across multiple trading pairs.
func BenchmarkMultipleTradingPairs(b *testing.B) {
	pairs := []string{"BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"}
	orderBooks := make(map[string]*orderbook.OrderBook)
	strategies := make(map[string]*matching.MatchingStrategy)

	for _, pair := range pairs {
		ob := orderbook.NewOrderBook(pair)
		// Setup with maker orders
		for i := 0; i < 50; i++ {
			order := domain.NewOrder(
				fmt.Sprintf("maker-%s-%d", pair, i),
				pair,
				fmt.Sprintf("user-%d", i),
				domain.SideSell,
				domain.OrderTypeLimit,
				big.NewInt(50000+int64(i)),
				*big.NewInt(100),
				domain.TIFGTC,
			)
			_ = ob.AddOrder(order)
		}
		orderBooks[pair] = ob
		strategies[pair] = matching.NewMatchingStrategy(0.0)
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		for _, pair := range pairs {
			order := domain.NewOrder(
				fmt.Sprintf("taker-%s-%d", pair, i),
				pair,
				"user-taker",
				domain.SideBuy,
				domain.OrderTypeLimit,
				big.NewInt(50100),
				*big.NewInt(10),
				domain.TIFGTC,
			)
			_, _, _ = strategies[pair].Match(order, orderBooks[pair])
		}
	}
}

// BenchmarkMatchingStrategiesComparison compares different matching strategies.
func BenchmarkMatchingStrategiesComparison(b *testing.B) {
	pairs := []struct {
		name    string
		tif     domain.TIF
	}{
		{"GTC", domain.TIFGTC},
		{"IOC", domain.TIFIOC},
		{"FOK", domain.TIFFOK},
	}

	for _, pair := range pairs {
		b.Run(pair.name, func(b *testing.B) {
			ob := orderbook.NewOrderBook("BTC/USDT")
			strategy := matching.NewMatchingStrategy(0.0)

			// Setup with maker orders
			for i := 0; i < 100; i++ {
				order := domain.NewOrder(
					fmt.Sprintf("maker-%d", i),
					"BTC/USDT",
					fmt.Sprintf("user-%d", i),
					domain.SideSell,
					domain.OrderTypeLimit,
					big.NewInt(50000+int64(i)),
					*big.NewInt(100),
					domain.TIFGTC,
				)
				_ = ob.AddOrder(order)
			}

			b.ResetTimer()
			b.ReportAllocs()

			for i := 0; i < b.N; i++ {
				order := domain.NewOrder(
					fmt.Sprintf("taker-%d", i),
					"BTC/USDT",
					"user-taker",
					domain.SideBuy,
					domain.OrderTypeLimit,
					big.NewInt(50100),
					*big.NewInt(1000),
					pair.tif,
				)
				_, _, _ = strategy.Match(order, ob)
			}
		})
	}
}

// BenchmarkLockAcquisitionRelease benchmarks distributed lock operations.
func BenchmarkLockAcquisitionRelease(b *testing.B) {
	// Simulated lock operations
	var mu sync.Mutex
	acquired := false

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		// Acquire
		mu.Lock()
		acquired = true

		// Release
		acquired = false
		mu.Unlock()
	}
}

// BenchmarkContextCreation benchmarks context creation overhead.
func BenchmarkContextCreation(b *testing.B) {
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = context.Background()
		_ = context.WithTimeout(context.Background(), time.Second)
	}
}

// ============================================================================
// Comparison with NestJS Reference (Placeholder)
// ============================================================================

// PerformanceComparisonResult holds results from comparing Go vs NestJS performance.
type PerformanceComparisonResult struct {
	OperationName      string
	GoNsPerOp         float64
	NestJSNsPerOp     float64
	GoOrdersPerSecond float64
	NestJSOrdersPerSec float64
	SpeedupFactor     float64
}

// CompareWithNestJS provides a framework for comparing with NestJS implementation.
// Actual comparison requires running both implementations and collecting metrics.
func CompareWithNestJS(goResult, nestJSResult float64) PerformanceComparisonResult {
	return PerformanceComparisonResult{
		OperationName:   "matching",
		GoNsPerOp:       goResult,
		NestJSNsPerOp:   nestJSResult,
		SpeedupFactor:   nestJSResult / goResult,
	}
}

// PrintPerformanceSummary prints a summary of performance results.
func PrintPerformanceSummary(b *testing.B, result PerformanceComparisonResult) {
	fmt.Printf("\n=== Performance Comparison: %s ===\n", result.OperationName)
	fmt.Printf("Go:       %.2f ns/op (%.2f orders/sec)\n",
		result.GoNsPerOp, result.GoOrdersPerSecond)
	fmt.Printf("NestJS:   %.2f ns/op (%.2f orders/sec)\n",
		result.NestJSNsPerOp, result.NestJSOrdersPerSec)
	fmt.Printf("Speedup:  %.2fx\n", result.SpeedupFactor)
}

// ============================================================================
// Helper Functions
// ============================================================================

// generateTestOrders generates a batch of test orders.
func generateTestOrders(count int) []*domain.Order {
	orders := make([]*domain.Order, count)
	for i := 0; i < count; i++ {
		side := domain.SideBuy
		if i%2 == 0 {
			side = domain.SideSell
		}
		orders[i] = domain.NewOrder(
			fmt.Sprintf("order-%d", i),
			"BTC/USDT",
			fmt.Sprintf("user-%d", i%100),
			side,
			domain.OrderTypeLimit,
			big.NewInt(50000+int64(i%100)),
			*big.NewInt(100),
			domain.TIFGTC,
		)
	}
	return orders
}

// generateMarketOrders generates market orders for benchmarking.
func generateMarketOrders(count int) []*domain.Order {
	orders := make([]*domain.Order, count)
	for i := 0; i < count; i++ {
		side := domain.SideBuy
		if i%2 == 0 {
			side = domain.SideSell
		}
		orders[i] = domain.NewOrder(
			fmt.Sprintf("market-order-%d", i),
			"BTC/USDT",
			fmt.Sprintf("user-%d", i%100),
			side,
			domain.OrderTypeMarket,
			nil, // Market orders don't have price
			*big.NewInt(10),
			domain.TIFGTC,
		)
	}
	return orders
}

// ============================================================================
// Realistic Load Simulation Tests
// ============================================================================

// BenchmarkRealisticTradingDay simulates a realistic trading day load.
func BenchmarkRealisticTradingDay(b *testing.B) {
	// Simulate: 10,000 orders/minute = ~166 orders/second
	// For 8 hour trading day: ~480,000 orders

	const ordersPerSecond = 166
	const duration = 1 * time.Second

	ob := orderbook.NewOrderBook("BTC/USDT")
	strategy := matching.NewMatchingStrategy(0.01)

	// Setup with sufficient liquidity
	for i := 0; i < 1000; i++ {
		order := domain.NewOrder(
			fmt.Sprintf("maker-%d", i),
			"BTC/USDT",
			fmt.Sprintf("user-%d", i),
			domain.SideSell,
			domain.OrderTypeLimit,
			big.NewInt(50000+int64(i%100)),
			*big.NewInt(1000),
			domain.TIFGTC,
		)
		_ = ob.AddOrder(order)
	}

	var totalOrders atomic.Int64

	b.ResetTimer()
	b.ReportAllocs()

	start := time.Now()
	orderID := 0

	for time.Since(start) < duration {
		for i := 0; i < ordersPerSecond/10 && time.Since(start) < duration; i++ {
			order := domain.NewOrder(
				fmt.Sprintf("taker-%d", orderID),
				"BTC/USDT",
				fmt.Sprintf("user-%d", orderID%1000),
				domain.SideBuy,
				domain.OrderTypeLimit,
				big.NewInt(50100),
				*big.NewInt(10),
				domain.TIFGTC,
			)
			_, _, _ = strategy.Match(order, ob)
			orderID++
			totalOrders.Add(1)
		}
		time.Sleep(100 * time.Millisecond)
	}

	actualRate := float64(totalOrders.Load()) / time.Since(start).Seconds()
	b.ReportMetric(actualRate, "orders/sec")
	b.ReportMetric(float64(totalOrders.Load())/duration.Seconds(), "target_orders/sec")
}

// BenchmarkLatencyDistribution measures latency distribution of matching operations.
func BenchmarkLatencyDistribution(b *testing.B) {
	ob := orderbook.NewOrderBook("BTC/USDT")
	strategy := matching.NewMatchingStrategy(0.0)

	// Setup with orders
	for i := 0; i < 500; i++ {
		order := domain.NewOrder(
			fmt.Sprintf("maker-%d", i),
			"BTC/USDT",
			fmt.Sprintf("user-%d", i),
			domain.SideSell,
			domain.OrderTypeLimit,
			big.NewInt(50000+int64(i)),
			*big.NewInt(100),
			domain.TIFGTC,
		)
		_ = ob.AddOrder(order)
	}

	latencies := make([]time.Duration, b.N)

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		start := time.Now()

		order := domain.NewOrder(
			fmt.Sprintf("taker-%d", i),
			"BTC/USDT",
			"user-taker",
			domain.SideBuy,
			domain.OrderTypeLimit,
			big.NewInt(50100),
			*big.NewInt(10),
			domain.TIFGTC,
		)
		_, _, _ = strategy.Match(order, ob)

		latencies[i] = time.Since(start)
	}

	b.StopTimer()

	// Calculate percentiles
	p50 := latencies[b.N/2]
	p95 := latencies[int(float64(b.N)*0.95)]
	p99 := latencies[int(float64(b.N)*0.99)]

	fmt.Printf("\nLatency Percentiles:\n")
	fmt.Printf("  p50: %v\n", p50)
	fmt.Printf("  p95: %v\n", p95)
	fmt.Printf("  p99: %v\n", p99)
}

// BenchmarkGCOverhead measures garbage collection overhead during matching.
func BenchmarkGCOverhead(b *testing.B) {
	b.ReportAllocs()

	// Measure with GOGC=100 (default)
	b.Run("default_gc", func(b *testing.B) {
		ob := orderbook.NewOrderBook("BTC/USDT")
		strategy := matching.NewMatchingStrategy(0.0)

		for i := 0; i < 100; i++ {
			order := domain.NewOrder(
				fmt.Sprintf("maker-%d", i),
				"BTC/USDT",
				fmt.Sprintf("user-%d", i),
				domain.SideSell,
				domain.OrderTypeLimit,
				big.NewInt(50000),
				*big.NewInt(100),
				domain.TIFGTC,
			)
			_ = ob.AddOrder(order)
		}

		var m1, m2 runtime.MemStats

		runtime.ReadMemStats(&m1)
		for i := 0; i < b.N; i++ {
			order := domain.NewOrder(
				fmt.Sprintf("taker-%d", i),
				"BTC/USDT",
				"user-taker",
				domain.SideBuy,
				domain.OrderTypeLimit,
				big.NewInt(50100),
				*big.NewInt(10),
				domain.TIFGTC,
			)
			_, _, _ = strategy.Match(order, ob)
		}
		runtime.ReadMemStats(&m2)

		b.ReportMetric(float64(m2.Mallocs-m1.Mallocs)/float64(b.N), "mallocs/op")
	})
}

// BenchmarkCPUCacheEffects measures CPU cache effects on order book operations.
func BenchmarkCPUCacheEffects(b *testing.B) {
	// Test with different order book sizes to measure cache effects
	sizes := []int{64, 256, 1024, 4096}

	for _, size := range sizes {
		b.Run(fmt.Sprintf("size-%d", size), func(b *testing.B) {
			ob := orderbook.NewOrderBook("BTC/USDT")

			for i := 0; i < size; i++ {
				order := domain.NewOrder(
					fmt.Sprintf("order-%d", i),
					"BTC/USDT",
					fmt.Sprintf("user-%d", i),
					domain.SideBuy,
					domain.OrderTypeLimit,
					big.NewInt(50000),
					*big.NewInt(100),
					domain.TIFGTC,
				)
				_ = ob.AddOrder(order)
			}

			b.ResetTimer()

			for i := 0; i < b.N; i++ {
				_ = ob.GetTopBuy()
				_ = ob.GetTopSell()
			}
		})
	}
}
