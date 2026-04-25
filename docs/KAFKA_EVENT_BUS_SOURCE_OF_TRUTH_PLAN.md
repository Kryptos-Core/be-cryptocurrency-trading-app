# Kế Hoạch Bổ Sung Kafka Event Bus Cho `be-cryptocurrency-trading-app`

> Ngày lập: 2026-04-25  
> Phạm vi: đánh giá khả thi và kế hoạch triển khai Kafka/event bus dựa trên repo backend hiện tại, proposal Kafka/Redis/TimescaleDB/ClickHouse, và roadmap multi-database hiện có.

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
  -> Outbox Kafka Publisher
       - publish Kafka sau commit
       - mark kafka_published_at sau broker ack
  -> Kafka consumers
       - Timescale market data
       - ClickHouse audit
       - Redis ticker/orderbook projection
       - Notification/WS
       - Go market aggregator / shadow matching
```

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

Điểm mạnh: tiền/order/trade được chốt trong DB transaction.  
Điểm yếu: order/trade/wallet chưa publish event chuẩn vào outbox/Kafka; Bull enqueue sau commit có thể fail; analytics/replay chưa có durable stream.

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

Tasks:

- Thêm Kafka client (`kafkajs` hoặc Nest microservice Kafka wrapper; `kafkajs` thường dễ kiểm soát producer/consumer hơn).
- Env đề xuất:

```env
KAFKA_ENABLED=false
KAFKA_BROKERS=127.0.0.1:9092
KAFKA_CLIENT_ID=crypto-trading-backend
KAFKA_TOPIC_PREFIX=crypto
KAFKA_SSL=false
KAFKA_SASL_ENABLED=false
KAFKA_DLQ_TOPIC=crypto.dlq
```

- Docker compose optional profile: Redpanda single-node cho local hoặc Kafka KRaft.
- Health check Kafka khi `KAFKA_ENABLED=true`.

Acceptance:

- `KAFKA_ENABLED=false`: app chạy như cũ.
- `KAFKA_ENABLED=true`: broker connected, health visible.

### Phase 2 — Outbox schema & event catalog

Tasks:

- Migration mở rộng `integration_outbox` metadata Kafka.
- Tạo `event-envelope.ts`, `event-topic-map.ts`.
- Mở rộng `OutboxAppender` nhận `schemaVersion`, `partitionKey`, `topic`, `correlationId`, `causationId`.
- Bổ sung catalog:

```ts
OrdersCreatedV1 = 'orders.created'
OrdersCancelledV1 = 'orders.cancelled'
OrdersRejectedV1 = 'orders.rejected'
TradesExecutedV1 = 'trades.executed'
WalletLedgerCreatedV1 = 'wallet_ledger.created'
BalancesUpdatedV1 = 'balances.updated'
MarketTickerV1 = 'market.ticker'
MarketOrderbookV1 = 'market.orderbook'
```

Acceptance:

- Existing outbox tests vẫn pass.
- Event envelope có unit tests.

### Phase 3 — Outbox Kafka Publisher

Tasks:

- Tạo `KafkaModule`, `KafkaProducerService`.
- Tạo `OutboxKafkaPublisherService.flushOnce()`:
  - select rows `kafka_published_at IS NULL` with `FOR UPDATE SKIP LOCKED`.
  - publish to topic with key = `partition_key`.
  - update topic/partition/offset/kafka_published_at sau ack.
  - error thì tăng attempts/lưu error, không mark published.
- Scheduler/Bull processor riêng cho Kafka publisher.
- Metrics backlog/failures/latency.

Acceptance:

- Kafka down không làm core transaction fail.
- Crash giữa publish và mark có thể duplicate, consumer idempotency xử lý được.

### Phase 4 — Publish order/trade/wallet events trong transaction

Order create:

- Append `orders.created` cùng transaction reserve balance + insert order.
- Payload có order_id, user_id, pair_id, symbol, side/type/price/amount/remaining/time_in_force, reserved fields, status.

Cancel:

- Append `orders.cancelled` cùng transaction release balance + update status.

Trade execution:

- Append `trades.executed` cùng transaction insert trade/update order/update wallet/ledger.
- Append `wallet_ledger.created` cho ledger legs hoặc include ledger legs trong trade event rồi consumer tách.
- Optional `balances.updated` after-state.

Acceptance:

- Transaction rollback -> không có outbox row.
- Outbox append fail -> transaction rollback.
- Event snapshot đủ để consumer không query DB trong hot path.

### Phase 5 — Kafka consumers cho read side

Consumers:

1. Timescale trade consumer: `trades.executed` -> `market_trades`/OHLCV.
2. ClickHouse audit consumer: all canonical events -> `event_audit_log`.
3. Ticker projection consumer: `trades.executed` -> Redis ticker -> optional `market.ticker`.
4. Orderbook projection consumer: order/trade/cancel -> Redis snapshot/depth.

Acceptance:

- Idempotent.
- Lag metrics visible.
- `MARKET_READ_SOURCE=postgres|timescale` hoạt động.
- `TICKER_SOURCE=nestjs|kafka_projection|go_aggregator` có thể rollback.

### Phase 6 — Go market aggregator shadow

- Go consume `trades.executed`.
- Update shadow Redis keys.
- Compare với NestJS projection.
- Không ảnh hưởng FE.

### Phase 7 — Go/TS shadow matching từ Kafka

- Consume `orders.created`/`orders.cancelled` keyed by pair.
- Không ghi production DB.
- Output shadow fills vào table/log riêng.
- Compare với trade thật.

### Phase 8 — Canary event-driven matching

Chỉ làm khi:

- outbox/Kafka ổn định;
- shadow parity cao;
- reconciliation tự động pass;
- rollback `MATCHING_ENGINE=ts` đã test.

Settlement vẫn phải ghi PostgreSQL transaction để chốt order/wallet/trade.

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

## 15. Env đề xuất

```env
KAFKA_ENABLED=false
KAFKA_BROKERS=127.0.0.1:9092
KAFKA_CLIENT_ID=crypto-trading-backend
KAFKA_TOPIC_PREFIX=crypto
KAFKA_SSL=false
KAFKA_SASL_ENABLED=false
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=
KAFKA_SASL_PASSWORD=

OUTBOX_KAFKA_PUBLISHER_ENABLED=false
OUTBOX_KAFKA_BATCH_SIZE=100
OUTBOX_KAFKA_FLUSH_INTERVAL_MS=1000
OUTBOX_KAFKA_MAX_ATTEMPTS=20
OUTBOX_KAFKA_LOCK_TTL_SEC=30

KAFKA_CONSUMERS_ENABLED=false
KAFKA_CONSUMER_GROUP_PREFIX=crypto-trading
KAFKA_DLQ_TOPIC=crypto.dlq

MARKET_READ_SOURCE=postgres
TICKER_SOURCE=nestjs
ORDERBOOK_READ_SOURCE=postgres
ANALYTICS_ENABLED=false
MARKET_TS_ENABLED=false
CLICKHOUSE_ENABLED=false
```

---

## 16. File/module dự kiến tác động

New:

```text
src/common/kafka/
  kafka.module.ts
  kafka-producer.service.ts
  kafka-consumer-runner.service.ts
  kafka.config.ts
  kafka-topic-resolver.ts

src/common/integration-events/
  event-envelope.ts
  event-topic-map.ts
  order-events.ts
  trade-events.ts
  wallet-events.ts
  market-events.ts

src/common/outbox/
  outbox-kafka-publisher.service.ts
  outbox-kafka-publisher.processor.ts
  outbox-kafka-publisher.scheduler.ts

src/common/projections/
  processed-events.repository.ts
```

Existing likely changed:

```text
src/entities/integration-outbox.entity.ts
src/common/outbox/outbox-appender.service.ts
src/common/integration-events/integration-event-catalog.ts
src/config/env.validation.ts
src/config/app.config.ts
src/health/health.controller.ts
src/modules/orders/infrastructure/persistence/order.repository.impl.ts
src/modules/orders/application/use-cases/create-order.use-case.ts
src/modules/orders/application/use-cases/cancel-order.use-case.ts
src/modules/matching/infrastructure/persistence/matching.repository.ts
src/modules/wallets/application/use-cases/apply-transaction.use-case.ts
src/modules/trading/services/trading-price-stream.service.ts
```

---

## 17. Rollback

- Kafka publisher lỗi: `OUTBOX_KAFKA_PUBLISHER_ENABLED=false`.
- Consumer/projection lỗi: `MARKET_READ_SOURCE=postgres`, `TICKER_SOURCE=nestjs`.
- ClickHouse lỗi: tắt `CLICKHOUSE_ENABLED`, replay sau từ Kafka retention.
- Timescale lỗi: fallback PostgreSQL market read.
- Go aggregator lỗi: `TICKER_SOURCE=nestjs`.
- Shadow/canary matching mismatch: `MATCHING_ENGINE=ts`, clear canary pairs.

---

## 18. Open questions

1. Production dùng Kafka tự vận hành, Redpanda, hay managed Kafka?
2. Retention topic cần 7 ngày, 30 ngày, hay lâu hơn?
3. JSON schema trong repo đủ chưa hay cần schema registry?
4. ClickHouse audit có yêu cầu compliance/immutability cụ thể không?
5. FE chấp nhận eventual consistency cho ticker/orderbook ở mức nào?
6. Có cần admin API/UI hiển thị outbox/Kafka lag không?
7. Có cần `orders.cancel_requested` nếu sau này cancel async?
8. Balance event nên publish per wallet after-state hay per ledger leg?
9. Có cần compacted topic cho latest ticker/orderbook snapshot không?
10. SLO target cho order placement, matching latency, market data lag là bao nhiêu?

---

## 19. Kết luận

Kafka nên thêm vào dự án như **event bus + durable replay log**, nhưng source of truth ban đầu cho core trading/money state vẫn nên là **PostgreSQL transaction + wallet ledger**.

Plan an toàn nhất:

1. Giữ PostgreSQL source of truth cho orders/trades/wallets.
2. Mở rộng transactional outbox hiện có để publish Kafka.
3. Consumer Kafka build TimescaleDB, ClickHouse, Redis projections.
4. Đưa Go vào market aggregator trước.
5. Shadow matching từ Kafka sau.
6. Chỉ canary event-driven matching khi có parity, reconciliation, rollback đầy đủ.

Cách này đạt mục tiêu event-driven scalable architecture mà giảm tối đa rủi ro sai tiền, duplicate trade, overfill và phá contract FE.
