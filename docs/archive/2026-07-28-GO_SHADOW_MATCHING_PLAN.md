# Phase 6-8: Go Shadow Matching

> **Status (2026-07-28):** Plan Phase 6-8 từ roadmap cũ. Phần "Tổng quan / Phase 6" là plan lịch sử — Go aggregator/matching đã scaffold trong `go-services/` nhưng chưa shadow/canary thực chiến. Trạng thái runtime hiện tại: xem `docs/GO_SERVICES_PRODUCTION_ROLLOUT.md`, `docs/GO_PUBLIC_WS_ROLLOUT_RUNBOOK.md`, `docs/GO_REAL_TRAFFIC_AND_MUTATION_PLAN.md`. Đề xuất giữ làm historical reference; chuyển sang `docs/archive/` nếu user muốn.
>
> **Trạng thái:** ⬜ CHƯA BẮT ĐẦU - Cần Go service infrastructure

## Tổng quan

Phase 6-8 là các phases để implement Go-based shadow matching và optional canary deployment.

**Điều kiện tiên quyết trước khi bắt đầu:**
- [ ] Phase 5a-5d hoàn thành và ổn định
- [ ] Reconciliation jobs pass không có lỗi
- [ ] Circuit breaker hoạt động đúng
- [ ] Rollback plan đã được test

---

## Phase 6: Go Market Aggregator Shadow

### Mục tiêu
- Go service consume `trades.executed` từ Kafka
- Update shadow Redis keys
- Compare với NestJS projection
- Không ảnh hưởng FE

### Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                    Go Aggregator Service                     │
│                                                             │
│  Kafka Consumer (crypto.trades.executed)                    │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────┐                      │
│  │   Order Book Reconstruction      │                      │
│  │   - Maintain in-memory book     │                      │
│  │   - Update on each trade       │                      │
│  │   - Calculate TWAP/VWAP       │                      │
│  └─────────────────────────────────┘                      │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────┐                      │
│  │   Shadow Redis Keys              │                      │
│  │   shadow:ticker:{pair}          │                      │
│  │   shadow:ohlcv:{pair}:{int}    │                      │
│  └─────────────────────────────────┘                      │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────┐                      │
│  │   Parity Check vs NestJS         │                      │
│  │   - Compare shadow vs production │                      │
│  │   - Emit drift metrics          │                      │
│  └─────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### Go Service Structure

```go
// cmd/aggregator/main.go
package main

import (
    "context"
    "log"
    "os"
    "os/signal"
    "syscall"

    "github.com/segmentio/kafka-go"

    "crypto-trading/aggregator/kafka"
    "crypto-trading/aggregator/engine"
    "crypto-trading/aggregator/redis"
    "crypto-trading/aggregator/metrics"
)

func main() {
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // Initialize components
    redisClient := redis.NewClient(os.Getenv("REDIS_URL"))
    kafkaConsumer := kafka.NewConsumer(
        os.Getenv("KAFKA_BROKERS"),
        "crypto.trades.executed",
        os.Getenv("KAFKA_CONSUMER_GROUP"),
    )
    bookEngine := engine.NewOrderBookEngine()
    metricsEmitter := metrics.NewPrometheusEmitter()

    // Start processing
    go kafkaConsumer.Consume(ctx, bookEngine.HandleTrade)
    go bookEngine.Start(ctx)
    go metricsEmitter.Start(ctx, bookEngine)

    // Graceful shutdown
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
    <-sigCh
    cancel()
}
```

### Shadow Redis Keys

```go
const (
    ShadowTickerKey   = "shadow:ticker:%s"   // e.g., shadow:ticker:BTC-USDT
    ShadowOHLCVKey    = "shadow:ohlcv:%s:%d" // e.g., shadow:ohlcv:BTC-USDT:60
    ShadowOrderbookKey = "shadow:orderbook:%s" // e.g., shadow:orderbook:BTC-USDT
)

// Shadow Ticker
type ShadowTicker struct {
    Pair       string  `json:"pair"`
    LastPrice  float64 `json:"last_price"`
    Volume24h  float64 `json:"volume_24h"`
    UpdatedAt  int64   `json:"updated_at"`
}

// Shadow OHLCV
type ShadowCandle struct {
    Pair       string  `json:"pair"`
    Interval   int     `json:"interval"`
    Open       float64 `json:"open"`
    High       float64 `json:"high"`
    Low        float64 `json:"low"`
    Close      float64 `json:"close"`
    Volume     float64 `json:"volume"`
    OpenTime   int64   `json:"open_time"`
    CloseTime  int64   `json:"close_time"`
}
```

---

## Phase 7: Go/TS Shadow Matching

### Mục tiêu
- Consume `orders.created`/`orders.cancelled` keyed by pair
- Không ghi production DB
- Output shadow fills vào table/log riêng
- Compare với trade thật

### Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                    Go Shadow Matcher                        │
│                                                             │
│  Kafka Consumer                                             │
│  ┌─────────────────────────────────────────────────┐     │
│  │ Topic: crypto.orders.created                       │     │
│  │ Topic: crypto.orders.cancelled                    │     │
│  │ Partition Key: pair_id                            │     │
│  └─────────────────────────────────────────────────┘     │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────┐     │
│  │   Shadow Matching Engine (Go)                     │     │
│  │   - Same matching logic as NestJS               │     │
│  │   - In-memory order book per pair               │     │
│  │   - Price-time priority matching               │     │
│  └─────────────────────────────────────────────────┘     │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────┐     │
│  │   Shadow Fill Output                            │     │
│  │   - Log to file/stdout                        │     │
│  │   - Compare with real trades                  │     │
│  │   - Report discrepancies                     │     │
│  └─────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Shadow Fill Log Format

```json
{
  "shadow_fill_id": "uuid",
  "timestamp": "2026-05-08T12:00:00.000Z",
  "pair": "BTC-USDT",
  "maker_order_id": "order-123",
  "taker_order_id": "order-456",
  "price": "43250.50",
  "amount": "0.5",
  "side": "BUY",
  "real_fill_exists": true,
  "real_fill_id": "real-trade-789",
  "match_diff_ms": 5,
  "price_diff": 0.0
}
```

### Parity Check

```go
// Compare shadow fills with real trades
func (m *Matcher) CheckParity(realTrades []*Trade) {
    for _, shadowFill := range m.shadowFills {
        realTrade := findByOrderPair(shadowFill.MakerOrderID, shadowFill.TakerOrderID, realTrades)

        if realTrade == nil {
            log.Printf("SHADOW_ONLY: %+v", shadowFill)
            metrics.Inc("shadow_only_fills_total")
            continue
        }

        priceDiff := math.Abs(shadowFill.Price - realTrade.Price)
        if priceDiff > 0.01 {
            log.Printf("PRICE_MISMATCH: shadow=%f real=%f diff=%f",
                shadowFill.Price, realTrade.Price, priceDiff)
            metrics.Inc("shadow_price_mismatch_total")
        }
    }
}
```

---

## Phase 8: Canary Event-Driven Matching

### Mục tiêu
- Chỉ làm khi infrastructure ổn định
- Shadow parity cao
- Reconciliation tự động pass
- Rollback `MATCHING_ENGINE=ts` đã test

### Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                   Canary Matching Switch                     │
│                                                             │
│  NestJS API                                                │
│         │                                                   │
│         ├──────────────────┐                               │
│         ▼                  ▼                               │
│  ┌──────────────┐  ┌──────────────┐                       │
│  │ MATCHING=ts  │  │ MATCHING=go  │                       │
│  │ (Production) │  │ (Canary)    │                       │
│  └──────────────┘  └──────────────┘                       │
│         │                  │                               │
│         └────────┬─────────┘                               │
│                  ▼                                         │
│         ┌─────────────────┐                                │
│         │ Settlement      │                                │
│         │ (Always NestJS) │                                │
│         │ PostgreSQL TX   │                                │
│         └─────────────────┘                                │
└─────────────────────────────────────────────────────────────┘
```

### Canary Config

```env
# Go canary matching
MATCHING_ENGINE=ts                 # 'ts' (default) | 'go'
MATCHING_GO_CANARY_PAIRS=BTC-USDT,ETH-USDT  # Pairs to test with Go
GO_CANARY_TRAFFIC_PERCENT=5         # % of traffic to shadow
GO_CANARY_PARITY_THRESHOLD=99.9    # Min parity % to continue
```

### Rollback Plan

```bash
# Immediate rollback
export MATCHING_ENGINE=ts

# Clear canary state
redis-cli DEL shadow:orderbook:* shadow:ticker:* shadow:ohlcv:*

# Verify restoration
curl http://localhost:3000/health/ready | jq '.go_rollout'
```

---

## Metric Comparison

| Metric | Phase 6 | Phase 7 | Phase 8 |
|--------|---------|---------|---------|
| `go_aggregator_ticker_updates_total` | ✅ | ✅ | ✅ |
| `go_aggregator_ohlcv_candles_total` | ✅ | ✅ | ✅ |
| `go_matcher_shadow_fills_total` | - | ✅ | ✅ |
| `go_matcher_parity_percent` | - | ✅ | ✅ |
| `go_matcher_price_mismatch_total` | - | ✅ | ✅ |
| `go_canary_traffic_percent` | - | - | ✅ |
| `go_canary_rollbacks_total` | - | - | ✅ |

---

## Pre-flight Checklist

Trước khi bắt đầu Phase 6:

- [ ] Go toolchain 1.21+ installed
- [ ] Kafka cluster available with topic `crypto.trades.executed`
- [ ] Redis cluster available for shadow keys
- [ ] Prometheus/Grafana for metrics
- [ ] Go module structure defined
- [ ] Matching algorithm spec reviewed
- [ ] Acceptance criteria documented
- [ ] Rollback plan tested

---

## Next Steps

1. Create `go-shadow-service/` directory
2. Initialize Go module: `go mod init github.com/crypto-trading/go-shadow-service`
3. Implement Phase 6: Market aggregator
4. Run shadow parity tests
5. Progress to Phase 7 when parity > 99%
6. Progress to Phase 8 when ready for canary

---

## Related Documentation

- [ADR-001: Relay vs Projection Decoupling](./KAFKA_EVENT_BUS_SOURCE_OF_TRUTH_PLAN.md#adr-001-relay-vs-projection-decoupling-2026-05-08)
- [Kafka Event Bus Architecture](./KAFKA_EVENT_BUS_SOURCE_OF_TRUTH_PLAN.md)
- [Matching Engine Architecture](./ARCHITECTURE.md)
