# Go Matching Engine — Technical Documentation

> **Trạng thái:** Production Ready (Market Aggregator), In Development (Matching Engine, Public WS Gateway)
>
> **Go version:** 1.23+

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổ-quan-kiến-trúc)
2. [Domain Models](#2-domain-models)
3. [Infrastructure Layer](#3-infrastructure-layer)
4. [Application Layer](#4-application-layer)
5. [Safety Modes](#5-safety-modes)
6. [Prometheus Metrics](#6-prometheus-metrics)
7. [Testing](#7-testing)
8. [Deployment](#8-deployment)

---

## 1. Tổng quan kiến trúc

### 1.1 Vị trí trong hệ thống

Go Matching Engine nằm trong kiến trúc migration dần (Gradual Migration) từ NestJS sang Go. Engine xử lý orders từ Kafka (`crypto-trading.orderplaced`) và ghi trades vào PostgreSQL.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        NestJS Backend                                 │
│  REST API  │  Socket.IO /trading  │  Matching Engine (TypeScript)  │
└───────┬──────────────────────────────────────────────────┬───────────┘
        │                                                  │
        │  Kafka: orderplaced, tradeexecuted               │
        │  Redis: trading:price_update                     │
        └──────────────────┬───────────────────────────────┘
                           │
        ┌──────────────────┼───────────────────────────────┐
        │                  │                               │
        ▼                  ▼                               ▼
┌───────────────┐  ┌─────────────────┐  ┌─────────────────────────┐
│Market         │  │ Matching Engine  │  │ Public WS Gateway      │
│Aggregator     │  │ (Go)            │  │ (Go)                  │
│               │  │                 │  │                       │
│Kafka consumer │  │ Kafka consumer  │  │ Socket.IO server      │
│Redis pub/sub  │  │ Redis lock      │  │ Redis subscriber      │
│               │  │ PostgreSQL tx   │  │                       │
└───────────────┘  └─────────────────┘  └─────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ PostgreSQL   │
                    │ Wallets/     │
                    │ Orders/Trades│
                    └──────────────┘
```

### 1.2 Module structure

```
matching-engine/
├── cmd/matching-engine/main.go
└── internal/
    ├── domain/
    │   ├── types.go          — Core types: Order, Trade, Side, OrderType, Status, TIF
    │   ├── orderbook/
    │   │   ├── orderbook.go  — OrderBook struct với RWMutex, buy/sell heaps
    │   │   └── heap.go       — Priority queue implementation
    │   ├── matching/
    │   │   ├── strategy.go    — MatchingStrategy với GTC/IOC/FOK support
    │   │   └── matching_test.go
    │   └── shadow/
    │       └── shadow.go     — ShadowRun, ShadowResult, ShadowFill types
    ├── infrastructure/
    │   ├── lock/
    │   │   ├── lock.go       — DistributedLock với Redis SETNX + Lua script
    │   │   └── lock_test.go
    │   └── persistence/
    │       ├── tx.go         — WithTransaction với pgxpool.Serializable
    │       ├── order.go     — OrderRepository
    │       ├── trade.go     — TradeRepository + Ledger + Outbox
    │       ├── shadow_repo.go — ShadowRepository
    │       └── errors.go    — Domain errors
    └── application/
        ├── app.go             — App struct, HTTP handlers, background workers
        ├── executor.go        — Executor: matching transaction với DB commit
        ├── shadow_engine.go   — ShadowEngine: matching không ghi DB
        ├── reconciliation.go  — ReconciliationService: so sánh shadow vs thực
        ├── canary/
        │   └── canary.go     — CanaryConfig: quản lý pairs ở canary mode
        ├── integration_test.go
        └── benchmark_test.go
```

### 1.3 Data flow

```
Order placed (Kafka)
       │
       ▼
  Kafka Consumer ────────────────► ShadowEngine (shadow mode)
       │                                │
       ▼                                ▼ (no DB writes)
  Distributed Lock ◄──────────► InsertShadowRun record only
       │
       ▼
  WithTransaction(SERIALIZABLE)
       │
       ├── FetchOrdersByIDs (FOR UPDATE)
       ├── FetchWalletsByUsers
       ├── MatchingStrategy.Match()
       │
       ▼
  For each trade:
  ├── InsertTrade
  ├── UpdateOrderFill
  ├── InsertWalletLedger (4 entries)
  └── InsertOutbox (trade.executed)
       │
       ▼
  Kafka Producer ────────────────► tradeexecuted topic
```

### 1.4 Key design decisions

| Quyết định | Lý do |
|-----------|--------|
| SERIALIZABLE isolation | Ngăn dirty reads trong multi-order matching |
| FOR UPDATE on orders | Tránh race condition khi nhiều instances cùng fill một order |
| Distributed lock (Redis SETNX) | Mutex trên pair để serialization of matching |
| Lua script cho lock release | Atomic check-and-delete để tránh releasing lock không thuộc về mình |
| Outbox pattern | Đảm bảo event được publish sau transaction commit |
| Shadow mode | An toàn khi deploy — so sánh kết quả trước khi commit thực sự |

---

## 2. Domain Models

### 2.1 Order

```go
type Order struct {
    OrderID           string
    PairID            string
    UserID            string
    Side              Side         // BUY | SELL
    Type              OrderType    // LIMIT | MARKET
    Price             *big.Int     // Scaled by 10^18
    Amount            big.Int      // Scaled by 10^18
    FilledAmount      big.Int
    Remaining         big.Int
    Status            Status       // OPEN | PARTIAL | FILLED | CANCELLED | REJECTED
    TIF               TIF          // GTC | IOC | FOK
    CreatedAt         time.Time
    SlippageTolerance *big.Int     // Basis points
}
```

- Giá và số lượng dùng `*big.Int` để tránh floating-point errors trong tài chính.
- `PricePrecision = 18`, `AmountPrecision = 18` — tất cả giá trị được scale lên 10^18.
- `Fill()` method tự động cập nhật `FilledAmount`, `Remaining`, và `Status`.

### 2.2 Trade

```go
type Trade struct {
    TradeID   string
    PairID    string
    MakerID   string
    TakerID   string
    MakerOID  string  // Maker Order ID
    TakerOID  string  // Taker Order ID
    Price     big.Int
    Amount    big.Int
    MakerFee  big.Int
    TakerFee  big.Int
    CreatedAt time.Time
}
```

### 2.3 OrderBook

`OrderBook` duy trì hai priority queues (heaps) cho buy và sell orders, cùng với một map để lookup nhanh theo OrderID.

```go
type OrderBook struct {
    mu         sync.RWMutex
    pairID     string
    buyOrders  *OrderQueue    // max-heap về giá
    sellOrders *OrderQueue    // min-heap về giá
    ordersByID map[string]*domain.Order
}
```

**Các operation chính:**

| Method | Mô tả |
|--------|--------|
| `AddOrder` | Thêm order vào heap đúng side |
| `CancelOrder` | Đánh dấu CANCELLED, xoá khỏi map |
| `GetTopBuy/GetTopSell` | Peek best bid/ask (không remove) |
| `GetDepth(n)` | Trả về top n levels cho mỗi side |
| `UpdateOrder` | Cập nhật filled amount, xoá nếu filled/cancelled |

### 2.4 Matching Strategy

`MatchingStrategy` xử lý order matching với ba Time-In-Force modes:

```
Taker Order
    │
    ├─► GTC (Good-Till-Cancelled)
    │       Loop qua tất cả orders, fill từng phần cho đến khi hết liquidity
    │
    ├─► IOC (Immediate-Or-Cancel)
    │       Như GTC nhưng phần không filled = 0 (không re-queue)
    │
    └─► FOK (Fill-Or-Kill)
            Kiểm tra trước: nếu không fill được 100% → reject toàn bộ
```

**Self-trade prevention:** Nếu `maker.UserID == taker.UserID`, skip order đó.

**Slippage tolerance cho market orders:** Nếu price deviated > tolerance basis points giữa các fills, reject.

---

## 3. Infrastructure Layer

### 3.1 Distributed Lock (Redis)

```go
const (
    LockTTL        = 10 * time.Second
    LockRetryDelay = 20 * time.Millisecond
    MaxRetries     = 15
)
```

- **Acquire:** `SET key value NX EX 10` — atomic set-if-not-exists với expiry.
- **Release:** Lua script `if GET == ARGV[1] then DEL else 0` — chỉ owner mới release được.
- **Extend:** Lua script `if GET == ARGV[1] then PEXPIRE else 0` — extend TTL nếu vẫn hold.
- **Backoff:** Exponential với jitter sau 3 lần thử đầu, cap 500ms.
- **Key format:** `matching:lock:{pairID}`

### 3.2 Transaction Management

```go
func WithTransaction(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
    tx, err := pool.BeginTx(ctx, pgx.TxOptions{
        IsoLevel: pgx.Serializable,
    })
    // ...
}
```

- **Isolation level:** `pgx.Serializable` — mạnh nhất, ngăn tất cả anomalies.
- Trade-off: Có thể gây serialization errors dưới tải cao, cần retry logic.

### 3.3 Persistence Repositories

| Repository | Bảng | Chức năng |
|-----------|------|-----------|
| `OrderRepository` | `orders` | `FetchOrdersByIDs`, `UpdateOrderFill` |
| `Repository` | `trades` | `InsertTrade`, `FetchWalletsByUsers` |
| `Repository` | `wallet_ledger` | `InsertWalletLedger` |
| `Repository` | `integration_outbox` | `InsertOutbox` |
| `ShadowRepository` | `shadow_matching_runs` | `Insert`, `InsertWithResult`, `GetUnmatched`, `CountByStatus` |

### 3.4 Database Errors

```go
var (
    ErrOrderNotFound       = errors.New("order not found")
    ErrWalletNotFound      = errors.New("wallet not found")
    ErrInsufficientBalance = errors.New("insufficient balance")
    ErrNegativeBalance     = errors.New("balance would go negative")
    ErrDuplicateTrade      = errors.New("duplicate trade")
    ErrLockTimeout         = errors.New("could not acquire lock")
)
```

---

## 4. Application Layer

### 4.1 Executor — Matching với DB Commit

`Executor.ExecuteMatch()` là entry point chính:

```
ExecuteMatch(ctx, taker, book)
    │
    ├─ Kiểm tra MUTATIONS_ENABLED=true?
    │       │
    │       └─► Nếu không → return ErrMutationsDisabled
    │
    ▼
executeMatchImpl(ctx, taker, book)
    │
    ├─ WithTransaction(SERIALIZABLE)
    │       │
    │       ├── Collect maker IDs từ book
    │       ├── FetchWalletsByUsers (validate wallets tồn tại)
    │       ├── Collect order IDs + FetchOrdersByIDs (FOR UPDATE)
    │       │
    │       ▼
    │       MatchingStrategy.Match(taker, book)
    │       │
    │       ▼
    │       For each trade:
    │       ├── InsertTrade
    │       ├── UpdateOrderFill (taker)
    │       ├── UpdateOrderFill (maker)
    │       ├── InsertWalletLedger x4 (maker CREDIT base, maker DEBIT quote,
    │       │                               taker CREDIT quote, taker DEBIT base)
    │       └── InsertOutbox (trade.executed → Kafka topic)
    │
    ▼
Update metrics: ordersProcessed, tradesCreated
```

**Wallet Ledger entries mỗi trade:**

| User | Currency | Direction | Amount |
|------|----------|-----------|--------|
| Maker | Base (BTC) | CREDIT | amount |
| Maker | Quote (USDT) | DEBIT | price × amount |
| Taker | Quote (USDT) | CREDIT | (amount − takerFee) |
| Taker | Base (BTC) | DEBIT | amount |

### 4.2 ShadowEngine — Matching không ghi DB

`ShadowEngine.ProcessShadowOrder()` chạy matching nhưng chỉ ghi vào `shadow_matching_runs`, không commit trades/wallets.

```
ProcessShadowOrder(ctx, jobData)
    │
    ├─ Acquire lock
    ├─ Create ShadowRun record
    ├─ runShadowMatching() — chạy strategy, trả ShadowResult
    ├─ InsertWithResult() — ghi kết quả vào shadow_matching_runs
    ├─ Release lock
    └─ KHÔNG ghi trades, orders, ledger, outbox
```

**ShadowResult:**

```go
type ShadowResult struct {
    Fills     []ShadowFill  `json:"fills"`
    Trades    int           `json:"trades"`
    MatchRate float64       `json:"match_rate"`  // 0.0–1.0
}
```

### 4.3 ReconciliationService — So sánh Shadow vs Thực

Background loop chạy định kỳ so sánh kết quả:

```
RunReconciliation(ctx, interval, pairs)
    │
    ├─ Ticker: chạy mỗi `interval`
    │
    ▼
ReconcilePair(ctx, pairID, since)
    │
    ├─ GetUnmatched() → các shadow runs không có trade tương ứng
    ├─ CountByStatus() → tổng shadow runs
    ├─ (optional) TradeCounter → số trades thực tế
    │
    ├─ MatchRate = (ShadowRuns − Unmatched) / ShadowRuns × 100%
    │
    ▼
shouldAlert()
    │
    ├─ MatchRate < 99.9% → ALERT
    └─ Unmatched > 0 → ALERT
```

### 4.4 CanaryConfig — Quản lý Canary Pairs

Canary mode cho phép một số pairs chạy Go engine thực sự trong khi các pairs khác vẫn dùng NestJS.

```go
// Env: MATCHING_GO_CANARY_PAIRS=BTC/USDT,ETH/USDT
cc := canary.NewCanaryConfig("BTC/USDT,ETH/USDT")
cc.IsEnabled("BTC/USDT") // true
cc.IsEnabled("SOL/USDT") // false
```

---

## 5. Safety Modes

Go Matching Engine có nhiều lớp safety:

| Mode | Env Variable | Giá trị | Hành vi |
|------|-------------|---------|---------|
| Read Only | `READ_ONLY_MODE` | `true` | Không ghi DB |
| Mutations Disabled | `MUTATIONS_ENABLED` | `false` | Không commit transactions |
| Shadow Mode | `SHADOW_MODE` | `true` | Ghi shadow_matching_runs thay vì trades |
| Canary Mode | `MATCHING_GO_CANARY_PAIRS` | CSV | Chỉ một số pairs được xử lý |
| Lock | (code) | — | Redis distributed lock trên pair |

**Matrix quyết định execution path:**

```
Pair in CANARY_PAIRS?
    │
    ├─► Có → ProcessCanaryOrder() → Reconciliation
    │
    └─► Không → SHADOW_MODE=true?
                │
                ├─► Có → ProcessShadowOrder() → shadow_matching_runs
                │
                └─► Không → MUTATIONS_ENABLED=true?
                            │
                            ├─► Có → ExecuteMatch() → DB commit
                            │
                            └─► Không → Log + skip
```

### 5.1 Feature Flags từ NestJS

| Flag | Giá trị | Mô tả |
|------|---------|--------|
| `TICKER_SOURCE` | `nestjs` / `go_aggregator` | Nguồn ticker data |
| `MATCHING_ENGINE` | `ts` / `go_shadow` / `go_canary` / `go` | Engine được sử dụng |
| `PUBLIC_WS` | `nestjs` / `go` | Socket.IO gateway |

---

## 6. Prometheus Metrics

### 6.1 Executor Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `matching_orders_processed_total` | Counter | Tổng orders đã xử lý |
| `matching_trades_created_total` | Counter | Tổng trades đã tạo |
| `matching_errors_total` | Counter | Tổng errors |

### 6.2 Shadow Engine Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `matching_shadow_processed_total` | Counter | Shadow orders đã xử lý |
| `matching_shadow_matched_total` | Counter | Shadow orders có matches |
| `matching_shadow_skipped_total` | Counter | Shadow orders bị skip |
| `matching_shadow_errors_total` | Counter | Shadow processing errors |

### 6.3 Canary Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `matching_canary_pairs_count` | Gauge | Số pairs đang ở canary mode |

### 6.4 HTTP Endpoints

```
GET /healthz  — Liveness probe
GET /readyz   — Readiness probe (Redis + Kafka + PostgreSQL)
GET /metrics  — Prometheus text format
GET /shadow/status — Shadow engine + canary pairs status
```

---

## 7. Testing

### 7.1 Integration Tests

| File | Coverage |
|------|----------|
| `integration_test.go` | Shadow mode, canary config, reconciliation, order book, lock |
| `canary_test.go` | Canary pair routing, config updates |
| `reconciliation_test.go` | Alert thresholds, multi-pair reconciliation |
| `lock_test.go` | Lock acquire/release, timeout, Lua script |

### 7.2 Benchmark Tests

| Benchmark | Target |
|-----------|--------|
| `BenchmarkOrderBookAddOrder` | Order addition throughput |
| `BenchmarkOrderBookProcessMatch` | Matching với empty book |
| `BenchmarkOrderBookProcessMatchWithLargeBook` | Matching với 1000 orders |
| `BenchmarkConcurrentMatching` | Concurrent matching |
| `BenchmarkRealisticTradingDay` | Realistic trading simulation |
| `BenchmarkLatencyDistribution` | p50/p95/p99 latency |
| `BenchmarkMemoryUsageOrderBook` | Memory profiling |
| `BenchmarkGCOverhead` | GC impact |
| `BenchmarkCPUCacheEffects` | Cache effects by book size |

---

## 8. Deployment

### 8.1 Docker Compose Profiles

```yaml
# docker-compose.prod.yml
services:
  matching-engine:
    profiles:
      - go-risky        # Chỉ start khi muốn risky operations
      - go-canary       # Chỉ start khi canary deployment
    environment:
      - MUTATIONS_ENABLED=false    # Default: read-only
      - SHADOW_MODE=true           # Default: shadow mode
```

### 8.2 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MUTATIONS_ENABLED` | `false` | Cho phép DB writes |
| `SHADOW_MODE` | `true` | Shadow matching mode |
| `MATCHING_GO_CANARY_PAIRS` | (empty) | CSV pairs cho canary |
| `MATCHING_SHADOW_MIN_MATCH_RATE_PERCENT` | `99.9` | Ngưỡng alert |
| `MATCHING_SHADOW_MAX_UNMATCHED_RUNS` | `0` | Max unmatched trước alert |
| `RECONCILIATION_INTERVAL_SECONDS` | `300` | Reconciliation interval |
| `POD_NAME` | (random) | Instance ID cho logging |

### 8.3 CI/CD Pipeline

```
.github/workflows/go-services.yml
    │
    ├─► Lint (go vet, staticcheck)
    ├─► Unit Tests + Race Detector
    ├─► Integration Tests (merge_group / main only)
    └─► Docker Build + Push
```

---

## Migration Roadmap

| Phase | Nội dung | Trạng thái |
|-------|----------|-------------|
| Phase 1 | Market Aggregator (reliability, multi-symbol, backfill) | ✅ Done |
| Phase 2 | Matching Engine — Order Book + Strategy + Lock | ✅ Done |
| Phase 3 | Matching Engine — DB Transaction Commit | ✅ Done |
| Phase 4 | Matching Engine — Shadow Mode Enhancement + Reconciliation | ✅ Done |
| Phase 5 | Matching Engine — Canary Mode + Gradual Rollout | ✅ Done |
| Phase 6 | Public WS Gateway — Socket.IO Server | ✅ Done |
| Phase 7 | Public WS Gateway — Auth, Subscriptions, Dashboard | ✅ Done |
| Phase 8 | Production Readiness — Metrics, Load Testing | ✅ Done |

---

## Dependencies

```go
require (
    github.com/google/uuid v1.6.0
    github.com/jackc/pgx/v5 v5.7.3
    github.com/redis/go-redis/v9 v9.7.0
    github.com/segmentio/kafka-go v0.4.48
)
```
