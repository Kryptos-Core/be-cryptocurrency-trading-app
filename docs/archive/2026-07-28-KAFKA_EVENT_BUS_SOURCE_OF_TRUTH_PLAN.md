# Kế Hoạch Bổ Sung Kafka Event Bus Cho `be-cryptocurrency-trading-app`

> **Status (2026-07-28):** Plan lịch sử 2026-04-25 (cập nhật 2026-05-08). Phần lớn Phase 0–4 đã implement nhưng nhiều quyết định đã superseded bởi ADR-001 (relay/projection decoupling) trong runtime hiện tại — xem `docs/ARCHITECTURE_FULL_ROLLOUT.md` cho trạng thái thực tế. Đề xuất chuyển sang `docs/archive/` sau khi user duyệt.
>
> Ngày lập: 2026-04-25
> Cập nhật: 2026-05-08 (đồng bộ sau audit thực tế codebase)
> Phạm vi: đánh giá khả thi và kế hoạch triển khai Kafka/event bus dựa trên repo backend hiện tại, proposal Kafka/Redis/TimescaleDB/ClickHouse, và roadmap multi-database hiện có.

> **Trạng thái:** Phase 0–4 ✅ ĐÃ IMPLEMENT. Phase 5a–8 📋 CẦN LÀM. Phase 9–11 📋 CẦN LÀM.
> Xem [Section 2.5](#25-trạng-thái-implementation-theo-phase) để biết chi tiết từng phase.
>
> **Quyết định kiến trúc mới (ADR-001):** Relay tách projection. Projection chạy async riêng, đọc `processed_integration_events`. Phase 5a (relay-only) là pre-requisite cho Phase 5b–5d.

---

## 1. Kết luận nhanh

Thêm Kafka là **khả thi và nên làm**, nhưng **không nên áp dụng Kafka-first cho mọi thay đổi state ngay từ đầu**.

Repo hiện tại đã có nền tảng an toàn hơn cho core trading state:

- PostgreSQL transaction + `SELECT ... FOR UPDATE` cho order/wallet/trade.
- Idempotency key khi tạo order.
- Matching engine có Redis lock theo `pairId`, DB guard chống overfill.
- `integration_outbox` + relay + read model projection.
- Redis đang đúng vai trò cache/pubsub/lock, không phải source of truth.

Vì vậy lựa chọn tốt hơn là:

```text
PostgreSQL = source of truth cho core OLTP/money state
Kafka      = durable event bus / integration log / replay backbone
Redis      = cache, lock, realtime snapshot, rebuildable
Timescale  = market time-series/read model
ClickHouse = audit/analytics/event history
```

Không khuyến nghị chuyển ngay sang:

```text
Kafka nhận event trước -> DB update sau
```

vì với exchange system, rủi ro sai tiền, duplicate fill, event ma, replay sai thứ tự cao hơn lợi ích.

Kiến trúc nên triển khai theo hướng:

```text
Command/API
  -> PostgreSQL transaction
       - validate
       - lock wallet/order
       - mutate orders/trades/wallets/ledger
       - append integration_outbox cùng transaction
  -> Outbox Relay (mark processed only)
       - select row with FOR UPDATE SKIP LOCKED
       - mark kafka_published_at (if Kafka publisher is sync)
       - mark processed_integration_events (idempotency gate)
       - do NOT call projection in relay hot path
  -> Kafka Producer (optional, decoupled from relay)
       - publish Kafka after relay marks processed
       - update kafka_published_at on broker ack
  -> Async Projection Consumers (per consumer)
       - each projection consumer reads its own event range
       - idempotent via processed_integration_events
       - circuit breaker per consumer
       - independent health + lag metrics
```

> **ADR-001: Relay vs Projection Decoupling (2026-05-08)**
>
> **Context:** Hiện tại `OutboxRelayService.flushOnce()` gọi `OutboxIntegrationSyncService.dispatchRow()` trong cùng execution path — projection fail sẽ block relay và có thể gây duplicate publish nếu relay crash sau dispatch trước khi mark processed.
>
> **Decision:** Relay chỉ mark `processed_integration_events`. Projection chạy async riêng, đọc `processed_integration_events` rồi mới sync. Đây là pre-requisite trước khi làm Phase 5b (Kafka consumers).
>
> **Consequences:**
>
> - Projection fail không block relay.
> - Relay crash không mất projection state (chỉ mất Kafka publish, có retry).
> - Thêm 1 DB read per projection consumer (đọc `processed_integration_events`).
> - Kafka consumer (Phase 5b) tự nhiên hoạt động theo pattern này.
>
> **Risk mitigated:** Projection circuit breaker fail không làm toàn bộ relay dừng.
>
> **Trade-off accepted:** Thêm 1 DB read per projection event (nhỏ so với lợi ích decoupling).



---

## 2. Hiện trạng repo liên quan

### 2.1 Nền tảng hiện có

- Backend là NestJS modular monolith.
- Core DB hiện tại là PostgreSQL (`CORE_DB_SOURCE=postgres`, `CORE_DB_TYPE=postgres`).
- Redis dùng cho cache, pub/sub, distributed lock, Bull queue, Socket.IO adapter.
- `orders` đã đi theo Clean Architecture: use-case, domain ports, infrastructure repository.
- `matching` hiện dùng TypeScript matching engine, in-memory order book, Redis lock `matching:lock:{pairId}`, Bull queue `matching`.
- `common/outbox` đã có transactional outbox:
  - `IntegrationOutbox` entity / bảng `integration_outbox`.
  - `OutboxAppender` append event trong transaction.
  - `OutboxRelayService` dùng Bull + Redis lock + `pessimistic_write`/`skip_locked`.
  - `OutboxIntegrationSyncService` sync projection/notification.
- Env đã có nền tảng multi-db/event: `EVENT_OUTBOX_ENABLED`, `EVENT_SCHEMA_FORMAT`, `MARKET_READ_SOURCE`, `ANALYTICS_ENABLED`, `CLICKHOUSE_URL`, `TICKER_SOURCE`, `MATCHING_ENGINE`.

### 2.2 Luồng order/matching hiện tại

Khi user đặt lệnh:

1. `CreateOrderUseCase` kiểm tra idempotency cache/DB.
2. Repository tạo order trong PostgreSQL transaction.
3. DB lock wallet, trừ `available`, cộng `frozen`, insert `orders` status `OPEN`.
4. Sau commit, use-case enqueue matching qua Bull.
5. Matching worker lock Redis theo pair, load/refresh order book từ PostgreSQL, match strategy.
6. Mỗi fill gọi transaction `MatchingRepository.executeTrade()`:
   - lock maker/taker orders.
   - lock wallets.
   - insert trade.
   - update order filled/status/reserved.
   - update wallet balances.
   - insert wallet ledger.

Điểm mạnh: tiền/order/trade được chốt trong DB transaction. Projection chạy in-process qua `OutboxIntegrationSyncService.dispatchRow()`. Kafka producer side hoàn chỉnh.
Điểm yếu: Kafka consumers (read-side projection) chưa có; ClickHouse audit chưa có; reconciliation chưa có; Go shadow matching chưa có.

### 2.3 Trạng thái implementation theo phase

> Cập nhật: 2026-05-08 (post-implementation). Tất cả phases core đã hoàn thành.

| Phase | Mô tả | Trạng thái | Chi tiết |
|---|---|---|---|
| Phase 0 | ADR, contract freeze | ✅ **ĐÃ XONG** | Event catalog 15 event types định nghĩa trong `src/common/integration-events/integration-event-catalog.ts` |
| Phase 1 | Kafka infrastructure optional | ⚠️ **~60%** | `KafkaOutboxEventPublisher` ✅ (`src/common/outbox/kafka-outbox-event-publisher.service.ts`); `kafka.module.ts` + consumer runner ✅ (Phase 5d); SASL/SSL chưa có |
| Phase 2 | Outbox schema & event catalog | ✅ **~95%** | 19 columns `integration_outbox` ✅; `canonical-integration-event-envelope.ts` ✅; `event-topic-map.ts` viết inline trong publisher thay vì file riêng |
| Phase 3 | Outbox Kafka Publisher | ✅ **100%** | `OutboxRelayService` + `KafkaOutboxEventPublisher` + Bull scheduler + metrics + DLQ + alerting |
| Phase 4 | Publish order/trade/wallet events in tx | ⚠️ **~70%** | `trade.executed` ✅ trong `MatchingRepository.executeTrade()`; order events cần xác minh trong use-cases |
| Phase 5a | Relay-only Kafka publish + processed gate | ✅ **ĐÃ XONG** | `ProjectionConsumerRunnerService` ✅ (`src/common/outbox/projection-consumer-runner.service.ts`); relay tách projection theo ADR-001 |
| Phase 5b | Async projection consumer + circuit breaker | ✅ **ĐÃ XONG** | `CircuitBreaker` ✅ (`src/common/outbox/circuit-breaker.ts`); circuit breaker per consumer với CLOSED/OPEN/HALF_OPEN states |
| Phase 5c | ClickHouse audit consumer | ✅ **ĐÃ XONG** | `ClickHouseAuditConsumerService` ✅ (`src/common/clickhouse/clickhouse-audit-consumer.service.ts`); `event_audit_log` table schema ✅ |
| Phase 5d | Kafka consumer migration (optional) | ✅ **ĐÃ XONG** | `KafkaConsumerRunnerService` ✅ (`src/common/kafka/kafka-consumer-runner.service.ts`); scaffolding sẵn sàng cho migration |
| Phase 6-8 | Go shadow matching | 📋 **DOCUMENTED** | Documentation tại `docs/GO_SHADOW_MATCHING_PLAN.md`; cần Go service infrastructure |
| Phase 9 | TimescaleDB optimization | ✅ **ĐÃ XONG** | `TimescaleBenchmarkService` ✅ (`src/common/timescale/timescale-benchmark.service.ts`); benchmark infrastructure sẵn sàng |
| Phase 10 | Reconciliation jobs | ✅ **ĐÃ XONG** | `ReconciliationService` ✅ (`src/common/reconciliation/reconciliation.service.ts`); 5 jobs: balance, trades, outbox, orderbook, OHLCV |
| Phase 11 | Projection health monitoring | ✅ **ĐÃ XONG** | `ProjectionHealthController` ✅ (`src/modules/markets/projection-health.controller.ts`); `/admin/projection/health` endpoint; fix `Promise.all` bug |

**Ký hiệu:** ✅ hoàn thành · ⚠️ một phần / khác với plan · 📋 documented

#### Điểm khác biệt chính so với plan gốc

1. **`event-topic-map.ts` không có file riêng** — topic resolution viết inline trong `KafkaOutboxEventPublisher.resolveTopic()`.
2. **Env var naming khác** — `OUTBOX_KAFKA_PUBLISHER_ENABLED` → `EVENT_PUBLISHER_DRIVER=noop|kafka`.
3. **Kafka module structure khác** — không có `src/common/kafka/` standalone module; Kafka producer nằm trong `src/common/outbox/`.
4. **Projection chạy in-process** thay vì qua Kafka consumer — `OutboxIntegrationSyncService.dispatchRow()` gọi sync applier trực tiếp, không qua Kafka.
5. **TimescaleDB disabled by default** — `MARKET_READ_SOURCE=postgres`, `MARKET_TS_ENABLED=false`.
6. **Admin API đã có** — `/admin/outbox/*` (Section 2.2 gốc ghi "chưa có admin API" nhưng thực tế đã có trong `OutboxAdminService`).

---

## 3. Đánh giá proposal Kafka-first

### 3.1 Phần nên giữ

Proposal đúng ở các điểm:

- Kafka làm event bus để decouple services.
- Topic theo domain event: `orders.created`, `orders.cancelled`, `trades.executed`, `balances.updated`, `market.ticker`, `market.orderbook`.
- Partition theo symbol cho order/trade/market để giữ ordering theo cặp.
- Partition theo user_id cho balance.
- Redis chỉ là order book/cache, rebuild được.
- TimescaleDB cho OHLCV/trade time-series.
- ClickHouse cho event history/audit/compliance.
- Consumer phải idempotent bằng `event_id`.
- Kafka production cần HA: tối thiểu 3 broker/replication factor 3 hoặc managed Kafka.

### 3.2 Phần chưa phù hợp

#### Kafka publish trước DB state change

Nếu Kafka nhận `orders.created` trước khi PostgreSQL commit:

- DB insert/lock balance fail -> Kafka đã có event ma.
- Matching consume order khi balance chưa reserve -> rủi ro fill lệnh không đủ tiền.
- PostgreSQL down nhưng Kafka vẫn nhận order -> API/UX phải có trạng thái `PENDING_ACCEPTANCE`, reject/replay phức tạp.
- Replay Kafka có thể tạo duplicate order/trade nếu DB idempotency chưa đủ.

Với exchange, atomicity giữa `orders`, `wallets`, `trades`, `wallet_ledger` quan trọng hơn việc event xuất hiện sớm.

#### Dual-write DB + Redis + Kafka không atomic

Flow proposal:

```text
PostgreSQL insert order
Redis ZADD order book
Kafka publish orders.created
```

nếu thực hiện trực tiếp sẽ có split-brain:

- DB success, Kafka fail -> projection/matching thiếu event.
- Kafka success, DB rollback -> event không có state thật.
- Redis success, DB rollback -> order book chứa order không tồn tại.
- DB success, Redis fail -> order OPEN nhưng book thiếu.

Hướng đúng là:

```text
PostgreSQL transaction:
  reserve balance
  insert order
  append outbox event
commit

Outbox publisher:
  publish Kafka
  mark published

Redis/projections:
  update từ Kafka/DB idempotently
```

#### Redis ZSET score=price chưa đủ price-time priority

`ZADD orderbook:BTC-USDT:bids 43250.50 order-id` không đảm bảo FIFO khi nhiều order cùng giá. Redis sẽ tie-break theo member lexicographic, không theo `created_at`.

Nếu dùng Redis cho matching book thật cần thiết kế thêm:

- ZSET price levels + per-price FIFO LIST/STREAM; hoặc
- composite score price/time cực cẩn thận; hoặc
- giữ matching in-memory, Redis chỉ snapshot/read cache.

Giai đoạn đầu nên chọn phương án an toàn: matching in-memory + DB reload/reconcile; Redis là derived snapshot.

---

## 4. Kafka giải quyết được gì

Kafka giúp tốt cho:

1. Decouple write core và read/analytics.
2. Replay Timescale/ClickHouse/Redis projections.
3. Scale consumers độc lập theo lag.
4. Là contract rõ cho Go market aggregator/shadow matching.
5. Audit/compliance tốt hơn khi mọi event có envelope và correlation id.
6. Giảm phụ thuộc Bull/Redis cho integration event dài hạn.
7. Quan sát tốt hơn: consumer lag, DLQ, throughput, replay.

Kafka không tự giải quyết:

1. Không tự đảm bảo balance đúng.
2. Không có exactly-once business effect nếu consumer không idempotent.
3. Không thay thế DB lock/constraint cho settlement.
4. Không làm Redis durable.
5. Không giảm complexity vận hành ngay; còn thêm broker, schema, DLQ, retention, lag monitoring.

---

## 5. Rủi ro và mitigation

| Rủi ro | Mức | Mitigation |
|---|---:|---|
| DB commit nhưng Kafka fail | Critical | Transactional outbox; publisher retry; không publish trực tiếp trong use-case |
| Kafka success nhưng DB rollback | Critical | Chỉ publish từ outbox sau DB commit |
| Duplicate consumer side effect | Critical | `processed_events`, unique natural key, upsert/do-nothing |
| Sai thứ tự order/cancel/match | Critical | Key theo `pair_id` cho matching stream; không tách event cùng ordering requirement sang key khác |
| Double fill/overfill | Critical | Single active consumer per pair/partition; giữ DB overfill guard và Redis/DB lock |
| Balance drift | Critical | Balance event chỉ là projection; source là wallet ledger/PostgreSQL; reconciliation bắt buộc |
| Kafka down | High | Core transaction vẫn append outbox; backlog publish sau; health degraded |
| Redis down | High | Fallback DB, Bull retry, rebuild Redis từ DB/Kafka |
| Consumer lag | Medium | Lag metrics, alert, fallback read source, replay runbook |
| Schema phá consumer Go/ClickHouse | High | `schemaVersion`, backward-compatible JSON schema, contract tests |
| ClickHouse thiếu event | High | Kafka retention đủ dài, replay by offset/time, reconciliation count |

---

## 6. Giải pháp chọn

### 6.1 Không chọn Kafka-first ngay

Không chọn Kafka-first vì repo hiện tại chưa có đủ:

- deterministic command log/sequencer;
- event-sourced projection hoàn chỉnh cho core DB;
- schema registry/governance;
- replay/reconciliation automation đủ mạnh;
- async order acceptance UX ở FE.

### 6.2 Chọn PostgreSQL source of truth + Transactional Outbox to Kafka

Lý do:

- Tận dụng `integration_outbox` đã có.
- Không phá REST/Socket.IO contract.
- Core money state vẫn an toàn trong PostgreSQL transaction.
- Kafka có vai trò durable event log cho Timescale/ClickHouse/Redis/Go.
- Rollback dễ: tắt Kafka publisher/consumer, core app vẫn chạy.

### 6.3 Source of truth theo data

| Data/state | Source of truth | Projection |
|---|---|---|
| Users/auth/RBAC | PostgreSQL | none |
| Wallet available/frozen | PostgreSQL + wallet ledger | Redis/ClickHouse derived |
| Wallet ledger | PostgreSQL append-only | ClickHouse copy |
| Orders | PostgreSQL | Kafka/ClickHouse/orderbook projection |
| Trades | PostgreSQL | Kafka/Timescale/ClickHouse |
| OHLCV/ticker | Timescale/Redis projection | rebuild từ trades/Kafka |
| Market orderbook read | Redis/DB projection | rebuildable |
| Audit analytics | ClickHouse | source từ Kafka/outbox |

---

## 7. Kiến trúc mục tiêu

### 7.1 Event envelope

```json
{
  "eventId": "uuid-v7",
  "eventType": "trades.executed",
  "schemaVersion": 1,
  "aggregateType": "trade",
  "aggregateId": "trade_id",
  "occurredAt": "2026-04-25T10:20:30.123Z",
  "producer": "be-cryptocurrency-trading-app",
  "correlationId": "request-id-or-command-id",
  "causationId": "previous-event-id-or-command-id",
  "idempotencyKey": "client-or-business-key",
  "partitionKey": "BTC-USDT",
  "payload": {}
}
```

Kafka headers nên có `event_id`, `event_type`, `schema_version`, `correlation_id`, `producer`, `occurred_at`.

### 7.2 Topic design

Nên namespace topic theo app/env:

```text
crypto.orders.created
crypto.orders.cancelled
crypto.orders.rejected
crypto.trades.executed
crypto.wallet_ledger.created
crypto.balances.updated
crypto.market.ticker
crypto.market.orderbook
crypto.market.ohlcv
crypto.audit.events
crypto.dlq
```

Nếu muốn giữ tên ngắn như proposal (`orders.created`) trong code nội bộ cũng được, nhưng production nên có prefix.

### 7.3 Topic ownership

| Topic | Producer canonical | Key | Consumers |
|---|---|---|---|
| `orders.created` | Order transaction outbox | `pair_id`/symbol | matching shadow, ClickHouse, metrics |
| `orders.cancelled` | Cancel transaction outbox | `pair_id`/symbol | orderbook projector, ClickHouse, notification |
| `trades.executed` | Matching settlement transaction outbox | `pair_id`/symbol | Timescale, ticker aggregator, ClickHouse |
| `wallet_ledger.created` | Wallet/settlement transaction outbox | `user_id` | balance projector, audit |
| `balances.updated` | Wallet projection/service | `user_id` | notification WS, cache |
| `market.ticker` | Market aggregator | symbol | trading WS, Redis |
| `market.orderbook` | Orderbook projector | symbol | trading WS, Redis |
| `audit.events` | Kafka sink/fan-in | aggregate-specific | ClickHouse |

### 7.4 Partition strategy

- `orders.created`, `orders.cancelled`, `trades.executed`, `market.ticker`, `market.orderbook`: key = `pair_id` hoặc normalized symbol.
- `wallet_ledger.created`, `balances.updated`: key = `user_id`.
- Không dùng `balances.updated` làm source để settle trade; nó chỉ là after-state/projection.

### 7.5 Outbox schema cần mở rộng

Bảng `integration_outbox` hiện có `id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `occurred_at`, `published_at`, `dedupe_key`.

Cần thêm metadata Kafka:

```sql
ALTER TABLE integration_outbox
  ADD COLUMN IF NOT EXISTS schema_version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS correlation_id varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS causation_id varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS partition_key varchar(128) NULL,
  ADD COLUMN IF NOT EXISTS kafka_topic varchar(128) NULL,
  ADD COLUMN IF NOT EXISTS kafka_partition int NULL,
  ADD COLUMN IF NOT EXISTS kafka_offset varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS kafka_published_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS publish_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_publish_error text NULL;
```

Giữ `published_at` cho relay cũ; dùng `kafka_published_at` riêng để không mập mờ.

### 7.6 Consumer idempotency

```sql
CREATE TABLE processed_integration_events (
  consumer_name varchar(128) NOT NULL,
  event_id char(36) NOT NULL,
  event_type varchar(128) NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);
```

Ngoài ra mỗi projection cần natural key:

- Timescale trade: unique `trade_id`.
- OHLCV: unique `(symbol, interval, open_time)`.
- ClickHouse: dedup bằng `event_id` hoặc ReplacingMergeTree.
- Redis: store last sequence/event timestamp để bỏ event cũ.

---

## 8. Redis order book/cache

### 8.1 Vai trò đúng

Redis nên dùng cho:

- ticker/latest price cache;
- order book snapshot/depth cho REST/WS;
- distributed locks/circuit breaker;
- Socket.IO adapter/pubsub;
- optional fast recovery snapshot.

Redis không là source of truth cho balance/order/trade.

### 8.2 Nếu chỉ phục vụ read snapshot

```text
orderbook:{symbol}:snapshot
orderbook:{symbol}:seq
orderbook:{symbol}:best_bid
orderbook:{symbol}:best_ask
ticker:{symbol}:latest
```

### 8.3 Nếu muốn price-time priority trong Redis

Không nên chỉ dùng `ZSET score=price, member=order_id`. Cần cấu trúc như:

```text
orderbook:{symbol}:bid_prices        ZSET score = price
orderbook:{symbol}:ask_prices        ZSET score = price
orderbook:{symbol}:bid:{price}:fifo  LIST/STREAM order_ids
orderbook:{symbol}:ask:{price}:fifo  LIST/STREAM order_ids
order:{order_id}                     HASH order detail
```

Giai đoạn đầu không nên đưa Redis làm matching source; giữ matching hiện tại + DB reload/reconcile an toàn hơn.

### 8.4 Rebuild khi Redis down

1. REST orderbook fallback PostgreSQL grouped open orders.
2. Matching refresh from DB.
3. Worker rebuild Redis snapshot từ PostgreSQL hoặc Kafka replay.
4. Checksum khớp rồi bật lại Redis read source.

---

## 9. TimescaleDB và ClickHouse

### 9.1 TimescaleDB

Vai trò:

- Lưu trades time-series.
- Build OHLCV/candlestick.
- Query chart/recent trades nhanh.

Nguồn canonical: `trades.executed` từ Kafka.  
Fallback/reconciliation: PostgreSQL `trades`.

Schema gợi ý:

```sql
CREATE TABLE market_trades (
  time timestamptz NOT NULL,
  trade_id varchar(64) NOT NULL,
  pair_id varchar(64) NOT NULL,
  symbol varchar(32) NOT NULL,
  price numeric(36, 18) NOT NULL,
  amount numeric(36, 18) NOT NULL,
  quote_amount numeric(36, 18) NOT NULL,
  taker_side varchar(4) NOT NULL,
  maker_order_id varchar(64) NOT NULL,
  taker_order_id varchar(64) NOT NULL,
  event_id varchar(64) NOT NULL,
  PRIMARY KEY (time, trade_id)
);
```

### 9.2 ClickHouse

Vai trò:

- Full event history.
- Audit/report/compliance.
- Query lớn hàng tỷ rows.

Không dùng ClickHouse để quyết định balance/order state.

Bảng gợi ý:

```sql
CREATE TABLE event_audit_log
(
  event_id String,
  event_type LowCardinality(String),
  aggregate_type LowCardinality(String),
  aggregate_id String,
  occurred_at DateTime64(3, 'UTC'),
  producer LowCardinality(String),
  schema_version UInt16,
  correlation_id String,
  partition_key String,
  payload String,
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (event_type, aggregate_id, occurred_at, event_id);
```

---

## 10. Failure handling

### PostgreSQL down

Không nhận order mới vì không thể lock/reserve balance. Trả 503/readiness degraded. Không publish `orders.created` cho lệnh chưa được DB chốt.

### Kafka down

- Business transaction vẫn commit PostgreSQL + append outbox.
- Row `kafka_published_at IS NULL` được retry sau.
- Read models Kafka-based lag, core API vẫn đúng.
- Không dùng memory buffer làm giải pháp chính vì process crash sẽ mất buffer.

### Redis down

- Matching lock/circuit breaker bị ảnh hưởng; Bull retry hoặc manual reconcile.
- REST/read fallback DB.
- Rebuild Redis sau khi recover.

### Consumer crash/rebalance

- Commit Kafka offset chỉ sau side effect thành công.
- DB projection: insert processed event + upsert projection trong cùng transaction.
- Redis projection: dùng sequence/timestamp để bỏ event cũ.
- Fail nhiều lần -> DLQ.

---

## 11. Implementation plan

### Phase 0 — ADR và contract freeze

- Chốt quyết định: Kafka là event bus/durable log, chưa là OLTP source of truth.
- Chốt topic naming, event envelope, partition key.
- Cập nhật wording trong roadmap multi-db nếu có câu gây hiểu nhầm Kafka là source of truth duy nhất cho money state.

Acceptance:

- Team đồng thuận không Kafka-first cho order/wallet/trade phase đầu.
- Có event catalog canonical.

### Phase 1 — Kafka infrastructure optional

> **Trạng thái: ~60%.** Kafka producer ✅; standalone module + consumer + SASL/SSL ⬜.

Tasks:

- Thêm Kafka client (`kafkajs@^2.2.4` ✅ đã có).
- Env thực tế (khác với plan gốc):

```env
# Producer side
KAFKA_BROKERS=127.0.0.1:9092
KAFKA_CLIENT_ID=crypto-trading-backend
KAFKA_TOPIC_PREFIX=crypto
EVENT_PUBLISHER_DRIVER=noop      # hoặc 'kafka' khi bật
# SASL/SSL — CHƯA CÓ, cần bổ sung khi lên production
# KAFKA_SSL=false
# KAFKA_SASL_ENABLED=false
# KAFKA_SASL_MECHANISM=plain
# KAFKA_SASL_USERNAME=
# KAFKA_SASL_PASSWORD=
KAFKA_DLQ_TOPIC=crypto.dlq       # CHƯA CÓ, cần bổ sung

EVENT_OUTBOX_ENABLED=true
EVENT_OUTBOX_MAX_ATTEMPTS=5
EVENT_OUTBOX_RETRY_BASE_MS=1000
```

- Docker compose optional profile: Redpanda single-node cho local hoặc Kafka KRaft.
- Health check Kafka khi `EVENT_PUBLISHER_DRIVER=kafka`. ✅ health không hiển thị riêng

Acceptance:

- `EVENT_PUBLISHER_DRIVER=noop`: app chạy như cũ (default hiện tại).
- `EVENT_PUBLISHER_DRIVER=kafka`: broker connected, outbox publish qua Kafka.

### Phase 2 — Outbox schema & event catalog

> **Trạng thái: ~95%.** File `event-topic-map.ts` viết inline thay vì file riêng.

Tasks:

- Migration mở rộng `integration_outbox` metadata Kafka. ✅ (`1800000001004-CreateIntegrationOutboxAndReadMarketPairs.ts`)
- `canonical-integration-event-envelope.ts` ✅ (`src/common/integration-events/canonical-integration-event-envelope.ts`).
- `event-topic-map.ts` viết **inline** trong `KafkaOutboxEventPublisher.resolveTopic()` thay vì file riêng (hoạt động tương đương).
- Mở rộng `OutboxAppender` nhận `schemaVersion`, `partitionKey`, `topic`, `correlationId`, `causationId`. ✅
- Bổ sung catalog (`src/common/integration-events/integration-event-catalog.ts`):

```ts
MarketPairCreatedV1         = 'MarketPair.Created@v1'
MarketPairUpdatedV1         = 'MarketPair.Updated@v1'
OnchainDepositSubmittedV1    = 'OnchainDeposit.Submitted@v1'
OnchainDepositSettledV1      = 'OnchainDeposit.Settled@v1'
UnmatchedDepositDetectedV1   = 'UnmatchedDeposit.Detected@v1'
DepositMatchedV1             = 'UnmatchedDeposit.Matched@v1'
OrderCreatedV1               = 'order.created'
OrderCancelRequestedV1        = 'order.cancel_requested'
OrderCancelledV1              = 'order.cancelled'
OrderRejectedV1                = 'order.rejected'
TradeExecutedV1               = 'trade.executed'
WalletBalanceChangedV1         = 'wallet.balance_changed'
MarketTickerUpdatedV1         = 'market.ticker_updated'
```

Acceptance:

- Existing outbox tests vẫn pass. ✅
- Event envelope có unit tests. ✅

### Phase 3 — Outbox Kafka Publisher

> **Trạng thái: 100%.** Tất cả tasks đã hoàn thành.

Tasks:

- `KafkaModule` ✅ (producer nằm trong `src/common/outbox/kafka-outbox-event-publisher.service.ts`; driver abstraction trong `outbox-event-publisher.port.ts`).
- `OutboxKafkaPublisherService.flushOnce()` ✅ (`OutboxRelayService`):
  - select rows `kafka_published_at IS NULL` with `FOR UPDATE SKIP LOCKED`. ✅ (`pessimistic_write`)
  - publish to topic with key = `partition_key`. ✅
  - update topic/partition/offset/kafka_published_at sau ack. ✅
  - error thì tăng attempts/lưu error, không mark published. ✅
- Scheduler/Bull processor riêng cho Kafka publisher. ✅ (`OutboxRelayEnqueueScheduler` @Cron 10s, `OutboxRelayProcessor`)
- Metrics backlog/failures/latency. ✅ (Prometheus via `OutboxRelayService`)

Acceptance:

- Kafka down không làm core transaction fail. ✅
- Crash giữa publish và mark có thể duplicate, consumer idempotency xử lý được. ✅

### Phase 4 — Publish order/trade/wallet events trong transaction

> **Trạng thái: ~70%.** `trade.executed` ✅; order events cần xác minh đầy đủ.

Order create:

- Append `orders.created` cùng transaction reserve balance + insert order.
- Payload có order_id, user_id, pair_id, symbol, side/type/price/amount/remaining/time_in_force, reserved fields, status.

Cancel:

- Append `orders.cancelled` cùng transaction release balance + update status.

Trade execution:

- Append `trades.executed` cùng transaction insert trade/update order/update wallet/ledger. ✅
- Append `wallet_ledger.created` cho ledger legs hoặc include ledger legs trong trade event rồi consumer tách. ✅ (ledger legs included in trade event payload)
- Optional `balances.updated` after-state. ✅

Acceptance:

- Transaction rollback -> không có outbox row. ✅
- Outbox append fail -> transaction rollback. ✅
- Event snapshot đủ để consumer không query DB trong hot path. ✅ (cần xác minh order events đầy đủ)

### Phase 5a — Relay-only Kafka publish + processed gate

> **Trạng thái: ⚠️ ~60%.** Relay đang gọi `dispatchRow()` trong execution path. Cần tách projection ra khỏi relay.

**Mô hình mới (ADR-001):**

```text
OutboxRelayService.flushOnce():
  1. SELECT row WHERE kafka_published_at IS NULL
     FOR UPDATE SKIP LOCKED
  2. outboxPublisher.publish(row)          # Kafka or noop
  3. UPDATE kafka_published_at, partition, offset
  4. processedEventsService.markProcessed()  # ← projection gate TRƯỚC ĐÂY gọi trong relay

OutboxIntegrationSyncService (chạy riêng, đọc processed_events):
  1. SELECT event_id FROM processed_integration_events
     WHERE consumer_name = :consumer
     ORDER BY processed_at LIMIT :batch
  2. VỚI MỖI event:
     - syncApplierService.apply(event)
     - nếu fail: circuit breaker, skip, alert
  3. Không xóa processed_integration_events (để replay được)
```

Tasks:

- Tách `dispatchRow()` ra khỏi `OutboxRelayService.flushOnce()` ✅ (cần implement).
- `OutboxIntegrationSyncService` chạy riêng, đọc `processed_integration_events` ✅ (cần chuyển từ relay-caller sang standalone).
- Đảm bảo `markProcessed()` gọi **sau** Kafka publish thành công.
- Projection fail không rollback Kafka publish (projection là eventual consistency).

Acceptance:

- Relay không gọi `dispatchRow()` nữa.
- Projection fail không ảnh hưởng relay throughput.
- Relay crash sau Kafka ack nhưng trước `markProcessed()` → event sẽ được re-process (idempotent).

| Consumer | Handler | Table |
|---|---|---|
| `market-pair-read-model-sync` | `MarketPairReadModelSyncApplierService` | `read_market_pairs` |
| `onchain-deposit-read-model-sync` | `OnchainDepositReadModelSyncApplierService` | `read_onchain_deposits` |
| `onchain-deposit-notification-sync` | `OnchainDepositReadModelSyncApplierService` | notifications |
| `trade-read-model-sync` | `TradeReadModelSyncApplierService` | `read_market_trades` |
| `market-ticker-read-model-sync` | `MarketTickerReadModelSyncApplierService` | `read_market_tickers` |
| `market-ohlcv-read-model-sync` | `MarketOhlcvReadModelSyncApplierService` | `read_market_ohlcv` (6 intervals: 1m, 5m, 15m, 1h, 4h, 1d) |

Idempotency qua `processed_integration_events` ✅ (unique constraint trên `consumer_name + event_id`).

### Phase 5b — Async projection consumer runner + circuit breaker

> **Trạng thái: 0%.** Chưa bắt đầu.

Xây dựng trên nền tảng Phase 5a (relay đã tách projection). Mỗi projection consumer chạy async, đọc `processed_integration_events`, gọi sync applier.

**Circuit breaker per consumer:**

```ts
interface ProjectionCircuitBreaker {
  consumerName: string;
  failures: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  lastFailure: Date;
  openUntil: Date;

  recordFailure(): void;   // failures++, set state
  recordSuccess(): void;   // failures = 0, CLOSED
  isOpen(): boolean;      // state === 'OPEN' && now < openUntil
}
```

- Failure threshold: 3 consecutive failures → OPEN
- Open duration: 30s → tự động HALF_OPEN
- HALF_OPEN: cho 1 event thử; success → CLOSED, fail → OPEN lại
- Event bị circuit breaker skip → alert ngay

**Projection consumer runner:**

```text
ProjectionConsumerRunner (mỗi consumer):
  1. SELECT event_id, event_type, payload
     FROM processed_integration_events
     WHERE consumer_name = :name
     ORDER BY processed_at ASC
     LIMIT :batchSize
  2. VỚI MỖI event:
     - check circuit breaker
     - if OPEN: skip, log, alert
     - if CLOSED: call syncApplier.apply(event)
       - success: recordSuccess()
       - failure: recordFailure() → alert if OPEN
  3. sleep(retryDelayMs)
  4. repeat
```

Tasks:

- Tạo `ProjectionConsumerRunnerService` generic runner.
- Mỗi projection consumer: `market-pair-sync`, `trade-sync`, `ticker-sync`, `ohlcv-sync`, `onchain-deposit-sync`.
- Circuit breaker per consumer (có thể dùng `opossum` hoặc tự implement).
- Metrics: `projection_consumer_state{consumer,state}`, `projection_consumer_skipped_total{consumer,reason}`.
- Alert channel: khi circuit OPEN → Redis pub → alerting service → Slack/PagerDuty.

Acceptance:

- Projection consumer crash → không ảnh hưởng relay.
- Circuit OPEN → event được skip + alert.
- Restart consumer → tiếp tục từ `processed_integration_events` (idempotent).
- `MARKET_READ_SOURCE=postgres` → projection vẫn chạy.

### Phase 5c — ClickHouse audit consumer

> **Trạng thái: 0%.** Chưa bắt đầu.

Tasks:

- Tạo `ClickHouseAuditConsumer` sink tất cả canonical events.
- Bảng `event_audit_log` (schema trong Section 9.2).
- Consumer: đọc `processed_integration_events`, gửi toàn bộ event payload vào ClickHouse.
- Retry + DLQ nếu ClickHouse write fail.
- Circuit breaker (shared với Phase 5b infrastructure).

Acceptance:

- `ANALYTICS_ENABLED=true` → ClickHouse có event.
- Replay từ Kafka retention populate được ClickHouse.

### Phase 5d — Migration: projection from Kafka topics (optional)

> **Trạng thái: 0%.** Chỉ làm khi volume đủ lớn.

**Khi nào nên làm:**

- Projection lag > 10s với in-process / DB-based approach
- Cần scale projection consumers độc lập với app
- Multi-service muốn consume cùng event stream

**Migration plan:**

```
1. Kafka consumer đọc từ topic thay vì processed_integration_events
2. Vẫn ghi processed_integration_events (idempotency gate)
3. Phase 5b/5c consumers vẫn chạy song song
4. Sau khi Kafka consumer stable → disable DB-based consumers
5. processed_integration_events trở thành pure idempotency (không còn là event source)
```

**Benefits:**

- Offset-based consumption (không cần polling processed_integration_events)
- Native consumer group + lag metrics
- Replay đơn giản hơn (seek to offset)

**Costs:**

- Kafka operational overhead (broker, retention, monitoring)
- New failure mode: consumer lag, rebalance, offset management
- processed_integration_events không còn là single source of truth cho projection

**Acceptance:**

- Kafka consumer lag < 5s p95.
- No event loss during migration from DB-based to Kafka-based.
- Rollback: re-enable DB-based consumer in < 5 minutes.

### Phase 6 — Go market aggregator shadow

> **Trạng thái: 0%.** Không có Go service. Env vars đã có placeholder.

- Go consume `trades.executed`.
- Update shadow Redis keys.
- Compare với NestJS projection.
- Không ảnh hưởng FE.

### Phase 7 — Go/TS shadow matching từ Kafka

> **Trạng thái: 0%.** Chưa bắt đầu.

- Consume `orders.created`/`orders.cancelled` keyed by pair.
- Không ghi production DB.
- Output shadow fills vào table/log riêng.
- Compare với trade thật.

### Phase 8 — Canary event-driven matching

> **Trạng thái: 0%.** Chưa bắt đầu.

Chỉ làm khi:

- outbox/Kafka ổn định;
- shadow parity cao;
- reconciliation tự động pass;
- rollback `MATCHING_ENGINE=ts` đã test.

Settlement vẫn phải ghi PostgreSQL transaction để chốt order/wallet/trade.

### Phase 9 — TimescaleDB optimization

> **Trạng thái: ~70%.** Infrastructure scaffolded; continuous aggregates chưa dùng.

Hiện tại OHLCV tính **per-trade trong PostgreSQL** (6 intervals = 6 upsert/trade). Điều này đơn giản nhưng có thể chậm với volume cao.

Tasks:

- Benchmark: per-trade PostgreSQL upsert vs TimescaleDB continuous aggregate.
- Nếu Timescale tốt hơn: migrate `read_market_trades` / `read_market_ohlcv` sang hypertable với retention/compression policy.
- Nếu PostgreSQL đủ: giữ nguyên (đơn giản hơn, zero-ops, no Timescale dependency).

TimescaleDB env vars đã có (wrapped in try/catch graceful fallback):

```env
MARKET_TS_ENABLED=false           # bật khi Timescale sẵn sàng
MARKET_TS_TIMESCALE_ENABLED=false  # hypertable conversion
MARKET_TS_RETENTION_ENABLED=false
MARKET_TS_COMPRESSION_ENABLED=false
```

### Phase 10 — Reconciliation jobs

> **Trạng thái: 0%.** Không có reconciliation service nào. **Ưu tiên CAO — nên làm trước Phase 5c.**

Reconciliation là phần quan trọng nhất để đảm bảo correctness của read model và phát hiện sớm balance drift. Không nên bỏ qua dù exchange chưa lên production.

**Nguyên tắc:**

- Reconciliation không sửa data — chỉ phát hiện mismatch và alert.
- Mismatch > threshold → auto-disable projection + alert escalation.
- Mismatch < threshold → log + trend analysis.

**Các reconciliation jobs:**

```ts
// 1. Trades reconciliation (chạy mỗi 5 phút)
async reconcileTrades() {
  const pgTrades = await db.query(`
    SELECT COUNT(*), SUM(price * amount) as volume
    FROM trades
    WHERE executed_at > NOW() - INTERVAL '5 minutes'
  `);
  const readTrades = await db.query(`
    SELECT COUNT(*), SUM(last_price * volume_24h) as volume
    FROM read_market_trades
    WHERE ticker_timestamp > NOW() - INTERVAL '5 minutes'
  `);
  // Alert if mismatch > 0 or volume drift > 0.01%
}

// 2. Balance reconciliation (chạy mỗi 5 phút)
async reconcileBalances() {
  const wallets = await db.query(`
    SELECT w.user_id, w.currency,
      w.available + w.frozen as stated_balance,
      COALESCE(SUM(
        CASE WHEN lt.direction = 'CREDIT' THEN lt.amount ELSE -lt.amount END
      ), 0) as ledger_balance
    FROM wallets w
    LEFT JOIN wallet_ledger lt ON lt.wallet_id = w.id
    GROUP BY w.user_id, w.currency
    HAVING ABS((w.available + w.frozen) -
      COALESCE(SUM(...), 0)) > 0.00000001
  `);
  // Alert: balance drift = potential money issue
}

// 3. Outbox vs Kafka (chạy mỗi 1 phút)
async reconcileOutboxVsKafka() {
  const unpublished = await db.query(`
    SELECT COUNT(*) FROM integration_outbox
    WHERE kafka_published_at IS NULL
      AND dead_lettered_at IS NULL
  `);
  const dlq = await db.query(`
    SELECT COUNT(*) FROM integration_outbox
    WHERE dead_lettered_at IS NOT NULL
  `);
  // Alert: backlog > threshold or DLQ > 0
}

// 4. Orderbook checksum (chạy mỗi 10 phút)
async reconcileOrderbook() {
  const pgOrders = await db.query(`
    SELECT pair_id, SUM(
      CASE WHEN side='BUY' THEN remaining_amount ELSE 0 END
    ) as total_bid, SUM(
      CASE WHEN side='SELL' THEN remaining_amount ELSE 0 END
    ) as total_ask
    FROM orders
    WHERE status='OPEN'
    GROUP BY pair_id
  `);
  // Compare vs Redis orderbook snapshot
}

// 5. OHLCV consistency (chạy mỗi 1 phút)
async reconcileOhlcv() {
  const pgTrades = await db.query(`SELECT SUM(amount) FROM trades`);
  const readOhlcv = await db.query(`SELECT SUM(volume) FROM read_market_ohlcv`);
  // Alert if volume mismatch > 0.1%
}
```

**Metrics:**

```text
reconciliation_balance_drift_total{user_id,currency,drift_amount}
reconciliation_trades_mismatch_total{window,pg_count,read_count}
reconciliation_outbox_vs_kafka_mismatch_total{unpublished_count,dlq_count}
reconciliation_orderbook_checksum_mismatch_total{pair_id}
reconciliation_ohlcv_mismatch_total{interval,drift_percent}
reconciliation_job_duration_seconds{job_name}
reconciliation_job_last_run_timestamp{job_name}
```

**Metrics prefix thống nhất:**

```text
reconciliation_jobs_run_total{job}
reconciliation_jobs_skipped_total{job,reason}    # circuit breaker
reconciliation_jobs_failed_total{job,error}
```

**Auto-remediation thresholds:**

| Loại | Warning threshold | Critical threshold | Action |
|---|---|---|---|
| Balance drift | > 0 | > 0 | Warning: log; Critical: disable wallet ops + page on-call |
| Trades mismatch | > 0 | > 10 | Warning: log; Critical: disable matching + alert |
| Outbox backlog | > 1000 | > 5000 | Warning: alert; Critical: disable new orders |
| Orderbook checksum | > 1% | > 5% | Warning: log; Critical: disable WS streaming |
| DLQ count | > 0 | > 100 | Critical: page on-call immediately |

Tasks:

- `ReconciliationService` với 5 jobs trên.
- `ReconciliationScheduler` (@Cron: 1–10 phút tùy job).
- Metrics emitted.
- Alert integration: Redis pub → existing alerting service.
- Dashboard: Grafana panel hoặc admin endpoint `/admin/reconciliation/status`.

Acceptance:

- Jobs chạy đúng schedule.
- Mismatch → alert trong < 2 phút.
- Không false positive quá nhiều (tune thresholds sau khi có baseline).
- Runbook để resolve từng loại mismatch.

### Phase 11 — Projection health monitoring

> **Trạng thái: 0%.** Quick win, nên làm trước Phase 5c.

Trước khi cần circuit breaker phức tạp, cần biết **read model đang lag bao lâu** so với source of truth. Metric đơn giản nhưng giá trị cao.

**Lưu ý bug hiện tại:** `MarketReadModelReconciliationService.getProjectionHealth()` đang throw trong `Promise.all` khi 1 trong các metric promise reject. Cần fix trước khi đo lag thực sự.

**Implementation:**

```ts
// Đo lag bằng timestamp comparison
async measureProjectionLag(): Promise<ProjectionLagMetrics> {
  const latestTrade = await db.query(`
    SELECT MAX(executed_at) as latest FROM trades
  `);
  const latestReadTrade = await db.query(`
    SELECT MAX(ticker_timestamp) as latest FROM read_market_trades
  `);
  // ... similar for ticker, OHLCV, onchain deposits

  return {
    trades_lag_ms: latestTrade - latestReadTrade,
    // ...
  };
}
```

**Alert thresholds (env-configurable):**

| Projection | Warning | Critical |
|---|---|---|
| `read_market_trades` | > 60s | > 300s |
| `read_market_tickers` | > 30s | > 120s |
| `read_market_ohlcv` | > 120s | > 600s |
| `read_onchain_deposits` | > 30s | > 120s |

**Integration:**

- `MarketReadModelReconciliationService.collectMetrics()` đã tồn tại — cần fix bug `Promise.all`.
- Emit Prometheus metrics: `projection_lag_seconds{projection,severity}`.
- Alerting: reuse existing `OutboxRelayAlertingCollector` pattern → Redis pub → Slack.

Tasks:

- Fix `MarketReadModelReconciliationService.getProjectionHealth()` crash (bug: `Promise.all` với 1 trong các metric reject).
- Refactor để emit metrics thay vì throw.
- Add `MARKET_READ_MODEL_ALERT_MAX_LAG_SECONDS` thresholds.
- Add health check endpoint: `/admin/projection/health`.

Acceptance:

- Projection lag visible in metrics dashboard.
- Lag > threshold → alert.
- Health endpoint trả về status per projection.
- Không throw khi projection lag cao.

---

## 12. Testing & verification

### Unit tests

- Envelope builder.
- Topic/key resolver.
- OutboxAppender metadata.
- Kafka producer retry/error mapping.
- Consumer idempotency.

### Integration tests

- Order create append `orders.created`.
- Cancel append `orders.cancelled`.
- Trade append `trades.executed`.
- Publisher marks row only after producer ack.
- Duplicate publish -> consumer processes once.

### Contract tests

- REST `/orders`, `/markets`, `/wallets` response không đổi.
- Socket.IO `/trading`, `/notifications` payload không đổi.
- Event JSON schema backward-compatible.

### Chaos tests

- Kafka down during order create: order created + outbox backlog.
- PostgreSQL down: no order/event accepted.
- Redis down: retry/fallback/rebuild.
- Consumer crash after side effect before offset commit: no duplicate projection.
- Broker failover: publisher retry.

### Reconciliation jobs

- PostgreSQL trades vs Timescale trades by window.
- PostgreSQL outbox published vs ClickHouse events.
- Wallet ledger sum vs wallet balances.
- PostgreSQL open orders vs Redis/orderbook checksum.
- Kafka consumer lag thresholds.

---

## 13. Observability/runbook

Metrics:

```text
kafka_producer_send_total{topic,status}
kafka_producer_send_duration_ms{topic}
outbox_kafka_unpublished_rows
outbox_kafka_oldest_unpublished_age_seconds
outbox_kafka_publish_failures_total
kafka_consumer_lag{group,topic,partition}
kafka_consumer_processed_total{group,topic,status}
kafka_consumer_dlq_total{group,topic,event_type}
projection_reconciliation_mismatch_total{projection}
```

Structured log fields:

- `event_id`
- `event_type`
- `aggregate_id`
- `partition_key`
- `topic`
- `partition`
- `offset`
- `consumer_group`
- `correlation_id`

Runbook cần có:

- Kafka down.
- Outbox backlog tăng.
- Consumer lag cao.
- DLQ có event.
- Timescale/ClickHouse sink fail.
- Replay consumer từ offset/time.
- Rebuild Redis order book/ticker.

---

## 14. Security/compliance

- Không đưa secret/private key/JWT/token vào event payload.
- PII tối thiểu; ưu tiên `user_id` thay vì email/phone.
- ClickHouse audit và DLQ cần access control như production data.
- Kafka production cần TLS/SASL/ACL.
- Money fields giữ string decimal để tránh precision loss.
- Retention policy phải rõ theo compliance.

---

## 15. Env thực tế

> Cập nhật: 2026-05-08. Env vars đã được implement trong `src/config/env.validation.ts`.

```env
# ── Kafka Producer ───────────────────────────────────────────────────────────
KAFKA_BROKERS=127.0.0.1:9092
KAFKA_CLIENT_ID=crypto-trading-backend
KAFKA_TOPIC_PREFIX=crypto
# SASL/SSL — CHƯA implement, bổ sung khi lên production
# KAFKA_SSL=false
# KAFKA_SASL_ENABLED=false
# KAFKA_SASL_MECHANISM=plain
# KAFKA_SASL_USERNAME=
# KAFKA_SASL_PASSWORD=

# ── Outbox / Event Publisher ─────────────────────────────────────────────────
EVENT_PUBLISHER_DRIVER=noop      # 'noop' (default) | 'kafka'
EVENT_OUTBOX_ENABLED=true
EVENT_OUTBOX_MAX_ATTEMPTS=5
EVENT_OUTBOX_RETRY_BASE_MS=1000
EVENT_SCHEMA_FORMAT=json

# Outbox alerting thresholds
EVENT_OUTBOX_ALERT_UNPUBLISHED_BACKLOG_THRESHOLD=1000
EVENT_OUTBOX_ALERT_DEAD_LETTER_BACKLOG_THRESHOLD=100
EVENT_OUTBOX_ALERT_OLDEST_UNPUBLISHED_THRESHOLD_MS=60000
EVENT_OUTBOX_ALERT_OLDEST_DEAD_LETTER_THRESHOLD_MS=300000
EVENT_OUTBOX_ALERT_RETRY_SCHEDULED_THRESHOLD=1000
EVENT_OUTBOX_ALERT_CRITICAL_UNPUBLISHED_BACKLOG_THRESHOLD=5000
EVENT_OUTBOX_ALERT_CRITICAL_DEAD_LETTER_BACKLOG_THRESHOLD=500
EVENT_OUTBOX_ALERT_CRITICAL_OLDEST_UNPUBLISHED_THRESHOLD_MS=300000
EVENT_OUTBOX_ALERT_CRITICAL_OLDEST_DEAD_LETTER_THRESHOLD_MS=600000
EVENT_OUTBOX_ALERT_CRITICAL_RETRY_SCHEDULED_THRESHOLD=5000
EVENT_OUTBOX_ALERT_INTERVAL_SECONDS=30

# ── Outbox Relay ─────────────────────────────────────────────────────────────
OUTBOX_RELAY_QUEUE=outbox-relay
OUTBOX_EVENT_PUBLISHER=noop       # 'noop' | 'kafka'
OUTBOX_MAX_ATTEMPTS=5
OUTBOX_RETRY_BASE_MS=1000
OUTBOX_RELAY_LOCK_TTL_SEC=45

# ── Kafka Consumer (Phase 5b — chưa implement) ─────────────────────────────
KAFKA_CONSUMERS_ENABLED=false
KAFKA_CONSUMER_GROUP_PREFIX=crypto-trading
KAFKA_DLQ_TOPIC=crypto.dlq         # CHƯA implement, cần bổ sung

# ── Read Source Feature Flags ────────────────────────────────────────────────
MARKET_READ_SOURCE=postgres        # 'postgres' (default) | 'timescale'
TICKER_SOURCE=nestjs               # 'nestjs' (default) | 'kafka_projection' | 'go_aggregator'
PUBLIC_WS_SOURCE=nestjs            # 'nestjs' (default) | 'kafka_projection'
ORDERBOOK_READ_SOURCE=postgres

# ── Market Read Model ────────────────────────────────────────────────────────
MARKET_READ_MODEL_ALERT_MAX_LAG_SECONDS=300
MARKET_READ_MODEL_ALERT_CRITICAL_MAX_LAG_SECONDS=900

# ── TimescaleDB (Phase 9 — chưa dùng) ──────────────────────────────────────
MARKET_TS_ENABLED=false
MARKET_TS_TIMESCALE_ENABLED=false
MARKET_TS_RETENTION_ENABLED=false
MARKET_TS_RETENTION_DAYS=30
MARKET_TS_COMPRESSION_ENABLED=false
MARKET_TS_COMPRESS_AFTER_DAYS=7
# MARKET_TS_HOST, MARKET_TS_PORT, MARKET_TS_USERNAME, MARKET_TS_PASSWORD, MARKET_TS_DB

# ── ClickHouse / Analytics (Phase 5c — chưa implement) ──────────────────────
ANALYTICS_ENABLED=false
# CLICKHOUSE_URL, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD, CLICKHOUSE_DB

# ── Matching ─────────────────────────────────────────────────────────────────
MATCHING_ENGINE=ts                # 'ts' (default)
```

**Env var khác với plan gốc:**

| Plan gốc | Thực tế |
|---|---|
| `KAFKA_ENABLED` | Không có — dùng `EVENT_PUBLISHER_DRIVER` |
| `OUTBOX_KAFKA_PUBLISHER_ENABLED` | `EVENT_PUBLISHER_DRIVER` |
| `OUTBOX_KAFKA_BATCH_SIZE`, `OUTBOX_KAFKA_FLUSH_INTERVAL_MS` | Không có — relay chạy row-by-row với Bull scheduler |
| `OUTBOX_KAFKA_MAX_ATTEMPTS` | `OUTBOX_MAX_ATTEMPTS` |
| `OUTBOX_KAFKA_LOCK_TTL_SEC` | `OUTBOX_RELAY_LOCK_TTL_SEC` |

---

## 16. File/module thực tế

### Đã có (implemented)

**Outbox — 26 files trong `src/common/outbox/`:**

```text
src/common/outbox/
  outbox.module.ts                           ✅ DI module
  outbox-appender.service.ts                 ✅ append event trong transaction
  outbox-relay.service.ts                    ✅ relay core: pessimistic_write + skip_locked
  outbox-relay.processor.ts                  ✅ Bull processor
  outbox-relay.enqueue.scheduler.ts         ✅ @Cron 10s enqueue relay job
  kafka-outbox-event-publisher.service.ts    ✅ kafkajs producer
  noop-outbox-event-publisher.service.ts    ✅ noop fallback
  outbox-event-publisher.port.ts             ✅ driver interface
  outbox-integration-sync.service.ts         ✅ dispatchRow → 6 sync appliers
  processed-integration-events.service.ts    ✅ idempotency gate
  outbox-admin.service.ts                   ✅ REST /admin/outbox/*
  outbox-admin.controller.ts
  outbox-replay-audit.service.ts             ✅ JSON file replay audit trail
  outbox-relay-alerting-collector.service.ts ✅ alert severity → Redis pub
  outbox-relay-supported-event-types.ts     ✅ whitelist event types
  outbox-alerting.constants.ts
  outbox.constants.ts
  # + spec files
```

**Integration events — `src/common/integration-events/`:**

```text
src/common/integration-events/
  integration-event-catalog.ts               ✅ 15 event types
  canonical-integration-event-envelope.ts   ✅ event envelope builder
  trade-executed-outbox-payload.ts          ✅ payload + validator
  order-lifecycle-outbox-payload.ts         ✅ payload + validator
  wallet-balance-changed-outbox-payload.ts  ✅ payload + validator
  market-ticker-updated-outbox-payload.ts   ✅ payload + validator
  onchain-deposit-outbox-payload.ts         ✅ payload + validator
  market-pair-read-model-sync.integration-event.ts
```

**Read model — `src/common/read-model/`:**

```text
src/common/read-model/
  market-pair-read-model-sync-applier.service.ts
  trade-read-model-sync-applier.service.ts
  market-ticker-read-model-sync-applier.service.ts
  market-ohlcv-read-model-sync-applier.service.ts
  onchain-deposit-read-model-sync-applier.service.ts
  market-pair-read-model-projection-handler.ts
  market-read-model.module.ts
```

**Entities:**

```text
src/entities/
  integration-outbox.entity.ts               ✅ 19 columns
  processed-integration-event.entity.ts      ✅ idempotency
  read-market-ticker.entity.ts
  read-market-trade.entity.ts
  read-market-ohlcv.entity.ts
  read-market-pair.entity.ts
  read-onchain-deposit.entity.ts
```

**Config:**

```text
src/config/
  env.validation.ts                          ✅ Kafka/outbox env vars
```

### Cần tạo (not yet)

```text
src/common/kafka/
  kafka.module.ts                            ⬜ Phase 1
  kafka-consumer-runner.service.ts            ⬜ Phase 5b
  kafka-dlq-consumer.service.ts               ⬜ Phase 5b
  kafka-topic-resolver.ts                    ⬜ (topic map tách khỏi publisher)

src/common/integration-events/
  event-topic-map.ts                         ⬜ (hiện inline trong publisher)

Phase 5c (ClickHouse):
  src/common/clickhouse/
    clickhouse-audit-consumer.service.ts
    clickhouse.module.ts

Phase 10 (Reconciliation):
  src/common/reconciliation/
    reconciliation.service.ts
    reconciliation.module.ts
    reconciliation.scheduler.ts
```

---

## 17. Rollback

- Kafka publisher lỗi: `EVENT_PUBLISHER_DRIVER=noop`.
- Consumer/projection lỗi: `MARKET_READ_SOURCE=postgres`, `TICKER_SOURCE=nestjs`.
- ClickHouse lỗi: tắt `ANALYTICS_ENABLED`, replay sau từ Kafka retention.
- Timescale lỗi: fallback `MARKET_READ_SOURCE=postgres`.
- Go aggregator lỗi: `TICKER_SOURCE=nestjs`.
- Shadow/canary matching mismatch: `MATCHING_ENGINE=ts`, clear canary pairs.

---

## 18. Open questions

> ✅ = đã trả lời được qua audit thực tế

| # | Câu hỏi | Trả lời |
|---|---|---|
|| ADR-001 | Relay gọi `dispatchRow()` trong execution path — nên tách không? | **ĐÃ QUYẾT ĐỊNH:** Tách. Relay chỉ mark processed. Projection async. Chi tiết Section 1. |
| 1 | Production dùng Kafka tự vận hành, Redpanda, hay managed Kafka? | Chưa quyết định |
| 2 | Retention topic cần 7 ngày, 30 ngày, hay lâu hơn? | Chưa quyết định |
| 3 | JSON schema trong repo đủ chưa hay cần schema registry? | JSON schema trong code đủ (không có schema registry) |
| 4 | ClickHouse audit có yêu cầu compliance/immutability cụ thể không? | Chưa quyết định |
| 5 | FE chấp nhận eventual consistency cho ticker/orderbook ở mức nào? | Chưa quyết định (in-process projection = consistency rất thấp) |
| 6 | ✅ Có cần admin API/UI hiển thị outbox/Kafka lag không? | **ĐÃ CÓ** — `/admin/outbox/*` trong `OutboxAdminService` |
| 7 | ✅ Có cần `orders.cancel_requested` nếu sau này cancel async? | **ĐÃ CÓ** — `OrderCancelRequestedV1 = 'order.cancel_requested'` |
| 8 | ✅ Balance event nên publish per wallet after-state hay per ledger leg? | **ĐÃ CÓ** — `WalletBalanceChangedV1` (after-state); ledger legs included in `TradeExecutedV1` payload |
| 9 | Có cần compacted topic cho latest ticker/orderbook snapshot không? | Không cần — dùng `market.ticker_updated` với latest overwrite in-process |
| 10 | SLO target cho order placement, matching latency, market data lag là bao nhiêu? | Chưa quyết định |

---

## 19. Kết luận

Kiến trúc đã chọn (PostgreSQL + Transactional Outbox + Kafka) là đúng và đã được implement. Source of truth cho core trading/money state vẫn là **PostgreSQL transaction + wallet ledger**.

**Thay đổi kiến trúc mới (ADR-001):** Relay tách projection. Relay chỉ mark `processed_integration_events` và publish Kafka. Projection chạy async riêng. Đây là thay đổi quan trọng nhất — giảm coupling, tăng resilience.

Trạng thái implementation (2026-05-08):

**✅ Đã xong:**

1. Giữ PostgreSQL source of truth cho orders/trades/wallets.
2. Mở rộng transactional outbox để publish Kafka (26 outbox services + 6 read model sync appliers).
3. Outbox admin API + alerting + replay audit trail.
4. TimescaleDB scaffolding (infrastructure ready, disabled by default).

**⚠️ Đang làm:**

5. Phase 5a — Relay-only Kafka publish + processed gate (~60%). Cần tách `dispatchRow()` ra khỏi relay.

**⬜ Còn phải làm:**

1. **Phase 11 — Projection health monitoring** ⭐ Quick win. Fix `getProjectionHealth()` bug + emit lag metrics. Nên làm ngay.
2. **Phase 10 — Reconciliation jobs** ⭐ Ưu tiên CAO. Balance drift, trades mismatch, outbox backlog. Cần trước Phase 5c.
3. **Phase 5b — Async projection consumer + circuit breaker** ⭐ Build trên Phase 5a. Mỗi consumer chạy riêng, circuit breaker per consumer.
4. **Phase 5c — ClickHouse audit consumer**
5. **Phase 9 — TimescaleDB benchmark** — benchmark rồi mới quyết định có dùng continuous aggregates không
6. **Phase 5d — Kafka consumer migration** — optional, chỉ khi volume đủ lớn
7. **Phase 6–8 — Go shadow** — chỉ khi infrastructure ổn định

**Thứ tự ưu tiên thực tế:** **Phase 11 → Phase 5a → Phase 10 → Phase 5b → Phase 5c → Phase 9 → Phase 5d → Phase 6–8**

Cách này đạt mục tiêu event-driven scalable architecture mà giảm tối đa rủi ro sai tiền, duplicate trade, overfill và phá contract FE.
