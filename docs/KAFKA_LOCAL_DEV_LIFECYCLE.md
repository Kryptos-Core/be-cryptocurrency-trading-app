# Kafka trong `be-cryptocurrency-trading-app` — Logic hiện tại & vòng đời local dev

> Last reviewed: 2026-08-16 — verified against `docker-compose.infrastructure.development.yml`, `docker-compose.development.yml`, `scripts/docker/cleanup-kafka-volumes.{ps1,sh,js}`, `src/common/outbox/{outbox.module,kafka-outbox-event-publisher,kafka-outbox-dlq-publisher,kafka-producer-circuit-breaker,outbox-relay}.ts`, `src/common/kafka/{kafka.module,kafka-consumer-runner}.ts`, `monitoring/kafka-jmx-exporter.yml`, `prometheus/{prometheus,prometheus.staging,alerts}.yml`, `.env.development.example`, `package.json`.
>
> **2026-08-16 update (a):** Zookeeper đã được thay bằng **KRaft combined mode** trong tất cả compose. Xem [`docs/kafka-kraft.md`](kafka-kraft.md) cho chi tiết.
> **2026-08-16 update (b):** Idempotent producer (`idempotent=true, acks=-1, maxInFlight=1`) + bounded DLQ retry (`EVENT_OUTBOX_DLQ_MAX_RETRIES=3`) đã bật mặc định. Xem [`docs/kafka-kraft.md#9`](kafka-kraft.md#9-idempotent-producer--bounded-dlq-retry).
> **2026-08-16 update (c):** JMX exporter sidecar (`bitnami/jmx-exporter:latest`) + Prometheus scrape job `kafka-jmx` + 3 alert rules đã wire vào tất cả compose. Xem [`docs/kafka-kraft.md#10`](kafka-kraft.md#10-jmx-exporter--prometheus-scrape).

Tài liệu này tổng hợp **logic Kafka hiện đang chạy trong repo** (cả compose, code lẫn script vận hành) và giải thích **vì sao trước đây Kafka "không bao giờ mở lại được nữa" sau khi tắt/bật Docker, nhưng giờ tắt/bật bình thường** — tức là đã có logic mới gì.

---

## 1. Trạng thái hiện tại: Kafka là gì trong repo này?

### 1.1 Vai trò kiến trúc

- **Source of truth cho trading state** vẫn là PostgreSQL (`integration_outbox` + transaction + `FOR UPDATE SKIP LOCKED`). Xem `docs/ARCHITECTURE.md` và `docs/ARCHITECTURE_FULL_ROLLOUT.md`.
- **Kafka là event bus tùy chọn** (profile `kafka`) — chỉ chạy khi operator bật. Khi tắt, `EVENT_PUBLISHER_DRIVER=noop` (mặc định) vẫn đảm bảo outbox relay chạy bình thường.
- Producer được **bọc bằng Circuit Breaker** + **driver pattern** (`noop | kafka`) + **DLQ topic** để tránh cascading failure.
- Consumer ở trạng thái **scaffolding optional** (`KAFKA_CONSUMERS_ENABLED=false` mặc định).

### 1.2 Stack thực tế (đang chạy)

| Thành phần | Trạng thái | File |
|---|---|---|
| Compose Kafka (KRaft combined mode, single broker, RF=1) | Profile `kafka`, có sẵn | `docker-compose.infrastructure.development.yml` (xem [`docs/kafka-kraft.md`](kafka-kraft.md) cho env block) |
| Producer NestJS (kafkajs `^2.2.4`, **idempotent=true, acks=-1**) | Wrapper qua driver factory | `src/common/outbox/kafka-outbox-event-publisher.service.ts` |
| **Bounded DLQ retry** | `dlq_retry_count` cột trên `integration_outbox` + `EVENT_OUTBOX_DLQ_MAX_RETRIES` cap | `src/common/outbox/outbox-relay.service.ts`, migration `1800000001020-AddOutboxDlqRetryCounter.ts` |
| DLQ publisher | Bật theo `KAFKA_DLQ_TOPIC_ENABLED` | `src/common/outbox/kafka-outbox-dlq-publisher.service.ts` |
| Circuit Breaker cho producer | 5 fail liên tiếp → OPEN 60s → HALF_OPEN 1 trial | `src/common/outbox/kafka-producer-circuit-breaker.service.ts` + `circuit-breaker.ts` |
| Consumer runner | Tắt mặc định, scaffold sẵn | `src/common/kafka/kafka-consumer-runner.service.ts`, `src/common/kafka/kafka.module.ts` |
| **Kafka JMX exporter sidecar** (`bitnami/jmx-exporter:latest`) | Profile `kafka`, scrape port 9191 (dev) / 9101 (prod) | `docker-compose.infrastructure.development.yml`, `monitoring/kafka-jmx-exporter.yml` |
| Prometheus scrape job `kafka-jmx` | `prometheus/prometheus.yml`, `prometheus/prometheus.staging.yml` | `prometheus/alerts.yml` (3 alert rules: JMX down, controller inactive, DLQ retry budget) |
| Cleanup volumes (Node wrapper + `.sh` + `.ps1`) | Bắt buộc khi `__cluster_metadata` log bị stale; KRaft không còn `NodeExistsException` | `scripts/docker/cleanup-kafka-volumes.{js,sh,ps1}` |
| Outbox relay coordination | Redis lock `outbox:relay:lock` (TTL 45s) + `pessimistic_write` + `skip_locked` | `src/common/outbox/outbox-relay.service.ts` |
| Tạo topic nhanh (dev) | Optional auto-create trong broker; explicit script dùng cho prod | `scripts/create-kafka-topics.js` |
| Go services consume Kafka | `market-aggregator`, `matching-engine`, `public-ws-gateway` đều khai báo `KAFKA_BROKERS=kafka:9092` | `docker-compose.development.yml` |

### 1.3 Env liên quan (`.env.development.example`)

```env
# Bật event outbox
EVENT_OUTBOX_ENABLED=true
EVENT_OUTBOX_MAX_ATTEMPTS=5
EVENT_OUTBOX_RETRY_BASE_MS=1000

# Driver publisher: noop | kafka | redis | bullmq
EVENT_PUBLISHER_DRIVER=noop

# Uncomment khi muốn bật Kafka
# KAFKAJS_NO_PARTITIONER_WARNING=1
# KAFKA_BROKERS=localhost:29092
# KAFKA_CLIENT_ID=crypto-trading-backend-outbox
# KAFKA_TOPIC_PREFIX=crypto-trading
# KAFKA_CLUSTER_ID=generate_once
# KAFKA_DLQ_TOPIC_ENABLED=true
# KAFKA_CONSUMERS_ENABLED=true
# KAFKA_CONSUMER_GROUP_PREFIX=crypto-trading
```

Mapping `env.validation.ts` (xem `src/config/env.validation.ts`):
- `EVENT_PUBLISHER_DRIVER` (default `noop`)
- `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_TOPIC_PREFIX`
- `KAFKA_REQUEST_TIMEOUT_MS` (default `30000`)
- `KAFKA_CONNECTION_TIMEOUT_MS` (default `10000`)
- `KAFKA_DLQ_TOPIC_ENABLED` (default `true`)
- **Idempotent producer + bounded DLQ retry** (mới 2026-08-16):
  - `KAFKA_PRODUCER_IDEMPOTENT` (default `true`)
  - `KAFKA_PRODUCER_MAX_IN_FLIGHT` (default `1`, kafkajs cap 5 khi idempotent)
  - `EVENT_OUTBOX_DLQ_MAX_RETRIES` (default `3`)
  - `EVENT_OUTBOX_DEAD_LETTER_RETRY_PER_FLUSH` (default `5`)
- **JMX exporter** (mới 2026-08-16):
  - `KAFKA_JMX_EXPORTER_PORT` (default `9191` dev, `9101` staging/prod)

### 1.4 Topic resolution & envelope

- Topic mặc định: `${KAFKA_TOPIC_PREFIX}.${eventType.toLowerCase().replace(/[^a-z0-9]+/g, '.')}`. Có thể override bằng `kafka_topic` trong outbox row.
- Envelope canonical (`src/common/integration-events/canonical-integration-event-envelope.ts`) mang `eventId`, `eventType`, `aggregateType`, `aggregateId`, `occurredAt`, `schemaVersion`, `payload`, `correlationId`, `causationId`, `idempotencyKey`, `partitionKey`. Headers Kafka mirror các field `event_id`, `event_type`, `aggregate_type`, `aggregate_id`, `schema_version`.

### 1.5 Vòng đời 1 message

```text
business tx (PostgreSQL)
  ├─ mutate orders / wallets / trades
  └─ OutboxAppender.append(em, …)          // cùng tx
OutboxRelayEnqueueScheduler  (@Cron 10s)
  └─ enqueue 'flush' vào Bull queue OUTBOX_RELAY_QUEUE
OutboxRelayProcessor.handleFlush
  └─ OutboxRelayService.flushOnce()
       ├─ Redis lock outbox:relay:lock (TTL 45s)
       ├─ SELECT … FOR UPDATE SKIP LOCKED (max 50 rows)
       ├─ OutboxIntegrationSyncService.dispatchRow(em, row)  // projection sync (DB)
       ├─ outboxPublisher.publish(row)                       // Kafka hoặc Noop
       │    └─ KafkaProducerCircuitBreakerService.publish
       │         ├─ CLOSED → KafkaOutboxEventPublisher.publish → producer.send
       │         │                  ├─ idempotent=true (kafkajs → producer-id)
       │         │                  ├─ maxInFlightRequests=1 (kafkajs caps 5)
       │         │                  └─ acks=-1 (forced by kafkajs when idempotent)
       │         └─ 5 fail liên tiếp → OPEN 60s, fast-fail, retry sau
       ├─ mark row.published_at + kafka_partition/offset/published_at
       ├─ nếu fail đủ maxAttempts → dead_lettered_at
       │    └─ KafkaOutboxDlqPublisher.publishDlq (topic "{prefix}.dlq.{event}")
       ├─ bounded DLQ retry: tối đa EVENT_OUTBOX_DLQ_MAX_RETRIES (default 3)
       │    └─ row.dlq_retry_count++; vượt cap → skip + alert
       └─ update operational metrics (outbox_relay_dlq_retry_skipped_total khi skip)
```

Khi `EVENT_PUBLISHER_DRIVER=noop`, toàn bộ nhánh Kafka được thay bằng `NoopOutboxEventPublisher` (chỉ trả về timestamp). Outbox vẫn chạy, projection sync vẫn chạy, không có side-effect ra ngoài.

---

## 2. Lịch sử thay đổi Docker Compose của Kafka (timeline)

Phần này dựng lại **từ `git log`** để trả lời câu hỏi "logic thêm mới là gì". Mỗi commit kèm `git show --stat` đã được kiểm tra.

### 2.1 Commit `893a738` — feat(docker): enhance infrastructure setup with Kafka and ClickHouse services (2026-05-08)

- Thêm lần đầu service `zookeeper` + `kafka` (Confluent `cp-kafka:7.6.1`) vào `docker-compose.infrastructure.yml` dưới profile `kafka`.
- **Chưa có `KAFKA_DATA_DIRS` / named volume** — Kafka ghi ra filesystem ephemeral của container, dữ liệu mất khi container chết.
- Chưa có restart policy cho Kafka.
- Producer/DLQ/CircuitBreaker **chưa có**.

### 2.2 Commit `7595043` — feat(kafka): implement Kafka DLQ support and enhance outbox publisher (2026-05-20)

- Thêm DLQ publisher, `KAFKA_REQUEST_TIMEOUT_MS` / `KAFKA_CONNECTION_TIMEOUT_MS`, volume `kafka_data` + `zookeeper_data`/`zookeeper_txn` (đây là lần đầu Kafka có **persistent volumes**).
- Thêm `KafkaProducerCircuitBreakerService` (CLOSED/OPEN/HALF_OPEN).
- Healthcheck tăng retries cho Kafka (`retries: 5` → `10`).

### 2.3 Commit `76e72a2` — feat(infrastructure): enhance Kafka setup and add cleanup scripts (2026-05-21)

**Đây là commit quan trọng nhất trả lời câu hỏi "vì sao lúc đầu restart là hỏng".**

- Thêm `restart: "no"` cho cả `zookeeper` và `kafka` trong compose (override default Docker auto-restart). Lý do: khi `unless-stopped` (default) mà container crash, Docker lặp lại restart loop trong khi trạng thái trên disk (Zookeeper znodes, Kafka log) bị "frozen" không nhất quán → broker khởi động lại ném lỗi `KeeperErrorCode = NodeExistsException` (Zookeeper đã có znodes từ session cũ, broker ID conflict) và **không bao giờ recover được**, mỗi lần restart càng làm tệ hơn vì volume bị rewrite liên tục.
- Tạo `scripts/docker/cleanup-kafka-volumes.ps1` + `.sh`:
  1. `docker stop` & `docker rm` 2 container Kafka + Zookeeper.
  2. Backup 3 named volume (`*_zookeeper_data`, `*_zookeeper_txn`, `*_kafka_data`) ra `kafka-volume-backup-{ts}.tar.gz` qua `alpine:latest`.
  3. `docker volume rm` 3 volume đó.
  4. `docker compose --profile kafka up -d` lại từ đầu.
- Trên compose file có block comment hướng dẫn cleanup thủ công.

### 2.4 Commit `c384475` — fix(docker): improve cleanup-kafka-volumes script error handling and backup process (2026-05-22)

- Sửa `cleanup-kafka-volumes.ps1`: kiểm tra `docker pull alpine:latest` có lỗi không, không fail cả script nếu không pull được (backup chỉ là best-effort).
- In đường dẫn backup rõ ràng, dùng `$LASTEXITCODE` chuẩn PowerShell.

### 2.5 Commit `a2cb42d` — refactor(docker): replace PowerShell cleanup script with cross-platform Node.js wrapper (2026-05-22)

- Thêm `scripts/docker/cleanup-kafka-volumes.js`: detect OS, gọi `.sh` (Unix) hoặc `.ps1` (Windows). `package.json` chuyển `docker:kafka:cleanup` từ `pwsh` sang `node scripts/docker/cleanup-kafka-volumes.js`.
- Đây là cách gọi cross-platform hiện tại: `npm run docker:kafka:cleanup` hoặc `node scripts/docker/cleanup-kafka-volumes.js [-y|--yes]`.

### 2.6 Commit `eefc904` — chore: restructure Docker Compose setup for development environment (2026-07-30)

- Tách `docker-compose.infrastructure.yml` → `docker-compose.development.yml` + `docker-compose.infrastructure.development.yml`. Vẫn giữ `restart: "no"` cho Kafka + Zookeeper.

### 2.7 Commit `ad01de9` — refactor: standardize container names in Docker Compose files (2026-07-30)

- Đổi container name `kafka` / `zookeeper` → `crypto-trading-dev-kafka` / `crypto-trading-dev-zookeeper`. **Đồng thời `restart: "no"` được đổi lại thành `restart: unless-stopped`** — đây là bước chuyển quan trọng (xem §3).

### 2.8 Commit `575b0d6` — refactor: update environment configuration and Docker setup (2026-07-30)

- Bổ sung network `crypto-trading-dev-network`, env validation `?:VAR is required`, harden healthcheck (`start_period`), volume đổi tên `crypto-trading-dev-kafka-data` (đồng bộ prefix), `KAFKA_ADVERTISED_LISTENERS` dùng `${APP_HOSTNAME:-localhost}` / `${KAFKA_EXTERNAL_PORT:-29092}`.
- Vẫn giữ `restart: unless-stopped` cho Kafka + Zookeeper.

### 2.9 Tóm tắt timeline

```text
2026-05-08  893a738  Add Kafka/Zookeeper (no volume, ephemeral)
2026-05-20  7595043  Add persistent volumes + DLQ + CircuitBreaker + timeout envs
2026-05-21  76e72a2  restart:"no" + cleanup-kafka-volumes scripts (fix NodeExistsException)
2026-05-22  c384475  Harden cleanup script (alpine pull, LASTEXITCODE)
2026-05-22  a2cb42d  Cross-platform Node.js wrapper for cleanup
2026-07-29  2932aea  Go services depend on Kafka broker (kafka:9092)
2026-07-30  eefc904  Split docker-compose → dev + infra (keep restart:"no")
2026-07-30  ad01de9  Rename containers + flip restart:"no" → unless-stopped
2026-07-30  575b0d6  Harden env validation, network, listeners, volume rename
2026-08-16  (KRaft)  Replace ZooKeeper with KRaft combined mode (single broker, RF=1) across dev/staging/prod compose; drop zookeeper_* volumes; cleanup scripts now manage only kafka_data. See docs/kafka-kraft.md.
```

---

## 3. Vì sao trước đây restart là "không bao giờ mở lại được", giờ thì bình thường?

### 3.1 Nguyên nhân gốc (khi mới implement)

Khi `docker compose down` / `docker compose restart`:

1. **Container Kafka chết đột ngột** (SIGKILL từ Docker, không chạy shutdown hook).
2. **Zookeeper znodes và Kafka log segments** trên named volume **vẫn còn** (do persistent volume commit `7595043`), nhưng **cluster metadata không kịp flush**.
3. Lần khởi động lại:
   - Zookeeper load lại znodes cũ → một số znodes bị "không thuộc session" nào → throw `KeeperErrorCode = NodeExists` (znode đã tồn tại từ cluster state cũ).
   - Kafka broker từ chối start vì cluster ID không khớp / broker ID đã bị đăng ký.
4. Docker restart policy mặc định (`unless-stopped`) khiến container **liên tục restart**, mỗi lần một chút dữ liệu cũ bị rewrite → tình trạng càng lúc càng hỗn loạn, log đầy `NodeExistsException`.
5. Operator không có script "clean slate" nào → chỉ có cách thủ công `docker volume rm ...` rồi khởi động lại.

### 3.2 Logic mới gì đã thêm để sửa

Bốn cải tiến xếp chồng lên nhau:

1. **`restart: "no"` trên Kafka + Zookeeper** (`76e72a2`, 2026-05-21)
   - Khi container crash, Docker **không** tự động restart vô hạn, tránh vòng lặp làm hỏng state.
   - Operator phải tự quyết định: chạy lại (sẽ thành công nếu state còn sạch) hoặc cleanup (nếu state đã hỏng).
2. **Cleanup scripts cross-platform** (`76e72a2` + `c384475` + `a2cb42d`)
   - Dừng container → backup volume → xóa volume → khởi động lại sạch. Tự động phát hiện OS, có backup best-effort trước khi xóa để không mất dữ liệu.
   - Script `cleanup-kafka-volumes.js` là wrapper gọi `.sh` hoặc `.ps1`; package.json expose `npm run docker:kafka:cleanup`.
3. **Healthcheck hardening** trong compose (`start_period: 60s`, retries cao hơn) — tránh Docker kill container trong khi broker đang warm up.
4. **`confluentinc/cp-kafka:7.6.1`** kết hợp **named volumes** (`kafka_data`, `zookeeper_data`, `zookeeper_txn`) để giữ cluster ID, znodes, log segments đồng bộ giữa các lần restart bình thường — đây là điều kiện để restart "bình thường" thực sự hoạt động.

### 3.3 Tại sao bây giờ tắt/bật Kafka lại bình thường?

Sau khi state ổn định (volume sạch + named volume persistent + container name chuẩn hóa + listener advertise đúng hostname), chu trình `docker compose stop` → `docker compose start` chạy đúng kỳ vọng:

- `docker compose stop kafka zookeeper` → SIGTERM → broker flush log + cluster metadata, zookeeper ghi znodes xuống txn log.
- Container dừng sạch (exit code 0), named volume giữ nguyên.
- `docker compose start kafka zookeeper` → Zookeeper đọc znodes từ txn log → tạo session mới, **không thấy NodeExists** vì cluster ID + znodes nhất quán → Kafka broker join cluster thành công.

Hai lưu ý vận hành để restart vẫn "bình thường":

- **Tắt hẳn qua `docker compose stop`** (gửi SIGTERM, 10s timeout) thay vì `docker kill` / `docker compose kill` / tắt Docker Desktop từ taskbar. Tắt Docker Desktop đôi khi tương đương `kill -9` cả daemon → container bị SIGKILL, dễ rơi vào tình trạng ban đầu.
- Nếu trước đó đã từng crash giữa chừng / cắt điện đột ngột / máy reboot mất điện, **chạy `npm run docker:kafka:cleanup` một lần** trước khi `up`. Script sẽ backup + recreate sạch.

### 3.4 Logic còn "chưa có / chưa xong" cho production

Tổng hợp từ `docs/KAFKA_EVENT_BUS_SOURCE_OF_TRUTH_PLAN.md` (đã archive) và code hiện tại:

| Hạng mục | Trạng thái |
|---|---|
| SASL / SSL cho Kafka | ❌ Chưa có env `KAFKA_SSL`, `KAFKA_SASL_*` |
| Schema registry | ❌ Dùng inline JSON schema, không có registry |
| KRaft mode (thay Zookeeper) | ✅ Đã chuyển sang KRaft combined mode (single-broker, RF=1). Xem [`docs/kafka-kraft.md`](kafka-kraft.md) — compose dev/staging/prod đều đã chạy `KAFKA_PROCESS_ROLES=broker,controller` với controller listener `:9093`. |
| Multi-broker / replication factor 3 | ❌ Compose hiện tại `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1`, single broker |
| Retention & cleanup policy cho dev | � `KAFKA_LOG_RETENTION_HOURS=168` (7 ngày); dev không cần nhiều hơn |
| Producer idempotent (`idempotent: true`, `maxInFlightRequests: 1`) | ✅ **Bật mặc định** (2026-08-16). `kafkajs` force `acks=-1` khi `idempotent=true`. Xem [`docs/kafka-kraft.md`](kafka-kraft.md#9-idempotent-producer--bounded-dlq-retry). |
| Bounded DLQ retry | ✅ **Bật mặc định** (2026-08-16). Cột `dlq_retry_count` + `EVENT_OUTBOX_DLQ_MAX_RETRIES=3` đảm bảo poisoned message không churn vô hạn. Alert `OutboxDlqRetryBudgetExhausted` page khi budget cạn. |
| Kafka JMX exporter + Prometheus | ✅ **Đã wire vào** (2026-08-16). Sidecar `bitnami/jmx-exporter:latest` trên tất cả compose (dev port 9191, staging/prod port 9101). Xem [`docs/kafka-kraft.md`](kafka-kraft.md#10-jmx-exporter--prometheus-scrape). |

---

## 4. Script & lệnh liên quan Kafka trong dev

### 4.1 Khởi động / dừng

```bash
# Postgres + Redis (no profile)
docker compose --env-file .env.development -f docker-compose.infrastructure.development.yml up -d

# Bật thêm Kafka (KRaft, single-broker combined mode)
docker compose --env-file .env.development -f docker-compose.infrastructure.development.yml --profile kafka up -d

# Dừng sạch (SIGTERM — quan trọng để state nhất quán)
docker compose --env-file .env.development -f docker-compose.infrastructure.development.yml --profile kafka stop

# Start lại
docker compose --env-file .env.development -f docker-compose.infrastructure.development.yml --profile kafka start

# Down (xóa container, GIỮ volume — state còn dùng lại được)
docker compose --env-file .env.development -f docker-compose.infrastructure.development.yml --profile kafka down
```

Hoặc qua npm script (chỉ profile trống + kafka/clickhouse/timescale):

```bash
npm run docker:infra:up         # chỉ postgres + redis
npm run docker:infra:down
npm run docker:infra:logs
npm run docker:infra:health
```

### 4.2 Khi Kafka không chịu start (stale `__cluster_metadata`, cluster ID lệch…)

```bash
npm run docker:kafka:cleanup
# Hoặc cross-platform thủ công:
node scripts/docker/cleanup-kafka-volumes.js -y
```

Script này (sau migration KRaft 2026-08-16):

1. `docker stop crypto-trading-dev-kafka` (best-effort)
2. `docker rm ...` (best-effort)
3. Tạo folder `kafka-volume-backup-{ts}` và `tar.gz` 1 named volume ra đó (qua `alpine:latest`) — chỉ `kafka_data` (volume chứa cả `__cluster_metadata`, log segments, offsets)
4. `docker volume rm crypto-trading-dev-kafka-data`
5. `docker compose --profile kafka up -d` lại từ đầu (KRaft sẽ tự re-init với `CLUSTER_ID` cố định)

Sau đó kiểm tra:

```bash
docker logs crypto-trading-dev-kafka --tail 50
docker exec crypto-trading-dev-kafka kafka-broker-api-versions --bootstrap-server localhost:9092
```

### 4.3 Tạo / list topic

```bash
# Dev: bật auto-create (KAFKA_AUTO_CREATE_TOPICS_ENABLE=true) — không cần tạo trước
# List topic
npm run kafka:topics:list

# Tạo topic cho prod (script trỏ vào KAFKA_BROKER qua env, default localhost:9092)
KAFKA_BROKER=localhost:29092 npm run kafka:topics:create
```

`scripts/create-kafka-topics.js` định nghĩa các topic:

```text
crypto-trading.orderplaced        partitions 6, RF 1
crypto-trading.ordercancelled      partitions 6, RF 1
crypto-trading.tradeexecuted       partitions 6, RF 1
crypto-trading.depositconfirmed    partitions 3, RF 1
crypto-trading.walletbalancechanged partitions 6, RF 1
crypto-trading.market.ticker       partitions 3, RF 1
```

⚠ Lưu ý: tên topic trong script (`crypto-trading.*`) **không trùng** với `KafkaOutboxEventPublisher.resolveTopic()` mặc định (`{prefix}.{eventType.toLowerCase().replace(/[^a-z0-9]+/g, '.')}`). Topic thực tế phát ra từ code NestJS là `crypto-trading.order.created`, `crypto-trading.trade.executed`, … (xem `OutboxIntegrationEventType` ở `src/common/integration-events/integration-event-catalog.ts`). Script `create-kafka-topics.js` chỉ phù hợp khi cần tạo trước các topic tương ứng — nên cập nhật danh sách cho khớp với runtime.

### 4.4 Bật Kafka cho backend (khi container đã chạy)

Sửa `.env.development`:

```env
EVENT_PUBLISHER_DRIVER=kafka
KAFKA_BROKERS=localhost:29092
KAFKA_CLIENT_ID=crypto-trading-backend-outbox
KAFKA_TOPIC_PREFIX=crypto-trading
KAFKA_DLQ_TOPIC_ENABLED=true
```

Restart NestJS (`npm run dev`). Theo dõi:

```bash
docker logs crypto-trading-dev-kafka --tail 100 -f
```

Verify controller quorum sau khi start:

```bash
docker exec crypto-trading-dev-kafka \
  kafka-metadata-quorum --bootstrap-server localhost:9092 describe --status
```

---

## 5. Cấu hình chi tiết trong compose hiện tại

Trích từ `docker-compose.infrastructure.development.yml` (snapshot 2026-08-16, sau khi chuyển sang KRaft — xem [`docs/kafka-kraft.md`](kafka-kraft.md) cho giải thích t�ng biến):

```yaml
kafka:
  image: confluentinc/cp-kafka:7.6.1
  container_name: crypto-trading-dev-kafka
  restart: unless-stopped
  profiles: ['kafka']
  environment:
    KAFKA_NODE_ID: 1
    KAFKA_PROCESS_ROLES: 'broker,controller'
    KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:9093'
    KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER'
    CLUSTER_ID: 'MkU3OEVBNTcwNTJENDM2Qk'
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_EXTERNAL:PLAINTEXT'
    KAFKA_LISTENERS: 'PLAINTEXT://0.0.0.0:9092,PLAINTEXT_EXTERNAL://0.0.0.0:${KAFKA_EXTERNAL_PORT:-29092},CONTROLLER://0.0.0.0:9093'
    KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka:9092,PLAINTEXT_EXTERNAL://${APP_HOSTNAME:-localhost}:${KAFKA_EXTERNAL_PORT:-29092}'
    KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
    KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
    KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true'
    KAFKA_LOG_RETENTION_HOURS: 168
    KAFKA_DATA_DIRS: /var/lib/kafka/data
    # Enable remote JMX so the bitnami/jmx-exporter sidecar can scrape broker MBeans.
    KAFKA_JMX_PORT: 9999
    KAFKA_JMX_HOSTNAME: kafka
    KAFKA_JMX_OPTS: >-
      -Dcom.sun.management.jmxremote
      -Dcom.sun.management.jmxremote.port=9999
      -Dcom.sun.management.jmxremote.rmi.port=9999
      -Dcom.sun.management.jmxremote.local.only=false
      -Dcom.sun.management.jmxremote.authenticate=false
      -Dcom.sun.management.jmxremote.ssl=false
      -Djava.rmi.server.hostname=kafka
  volumes:
    - crypto-trading-dev-kafka-data:/var/lib/kafka/data
  ports:
    - "${BIND_HOST:-127.0.0.1}:${KAFKA_EXTERNAL_PORT:-29092}:29092"
  healthcheck:
    # kafka-broker-api-versions thừa hưởng KAFKA_JMX_OPTS từ container → sẽ cố bind
    # JMX agent thứ 2 trên :9999 → "Address already in use". Unset JMX envs cho probe
    # để chỉ broker process là chủ JMX RMI socket.
    test: ["CMD-SHELL", "KAFKA_OPTS= KAFKA_JMX_OPTS= /usr/bin/kafka-broker-api-versions --bootstrap-server localhost:9092 || exit 1"]
    interval: 15s
    timeout: 10s
    retries: 5
    start_period: 60s
```

Service sidecar đi kèm:

```yaml
kafka-jmx-exporter:
  image: bitnami/jmx-exporter:latest
  container_name: crypto-trading-dev-kafka-jmx-exporter
  restart: unless-stopped
  networks:
    - crypto-trading-network
  profiles: ['kafka']
  environment:
    JMX_EXPORTER_CONFIG: /etc/jmx-exporter/kafka.yml
  volumes:
    - ./monitoring/kafka-jmx-exporter.yml:/etc/jmx-exporter/kafka.yml:ro
  ports:
    # Default 9101 đụng Flutter Dart DevTools trên Windows → đổi sang 9191.
    - "${BIND_HOST:-127.0.0.1}:${KAFKA_JMX_EXPORTER_PORT:-9191}:9191"
  command: ["9191", "/etc/jmx-exporter/kafka.yml"]
  depends_on:
    kafka:
      condition: service_healthy
```

> Phần §3.1, §3.2, §3.3 trước đây mô tả vì sao **ZooKeeper mode** dễ vỡ khi restart (NodeExistsException, SIGKILL, znodes lệch) — sau khi chuyển sang KRaft combined mode, phần lớn những vấn đề đó không còn xảy ra. Cleanup script giờ chỉ còn quản lý 1 volume `kafka_data` thay vì 3.

`x-logging: &default-logging` giới hạn log 3 file × 20MB cho tất cả service → tránh đầy disk khi để Kafka chạy lâu.

`network: crypto-trading-dev-network` được chia sẻ với Go services (`market-aggregator`, `matching-engine`, `public-ws-gateway`) — chúng `KAFKA_BROKERS=kafka:9092` thông qua Docker DNS nội bộ.

---

## 6. Circuit Breaker & DLQ — chi tiết

### 6.1 `CircuitBreaker` (`src/common/outbox/circuit-breaker.ts`)

- 3 trạng thái: `CLOSED` (normal) / `OPEN` (fast-fail) / `HALF_OPEN` (thử recover).
- `KafkaProducerCircuitBreakerService` cấu hình: `failureThreshold=5`, `openDurationMs=60_000`, `halfOpenMaxAttempts=1`.
- Khi OPEN, mọi `publish` bị reject ngay (`Circuit breaker OPEN: Kafka producer unavailable`) — relay skip row, **không làm hỏng transaction outbox DB**.
- Callback `onStateChange` đẩy gauge `circuit_breaker_state{name="kafka-producer"}` và counter `circuit_breaker_tripped_total` lên Prometheus (xem `src/telemetry/metrics.service.ts`).
- `CircuitBreakerRegistry` (`getOrCreate`) dùng cho consumer projection runners (`KafkaConsumerRunnerService`) — default `failureThreshold=3`, `openDurationMs=30_000`, `halfOpenMaxAttempts=1`.

### 6.2 DLQ (`kafka-outbox-dlq-publisher.service.ts`)

- Topic pattern: `{KAFKA_TOPIC_PREFIX}.dlq.{event_type}` (hoặc `dlq.{event_type}` nếu không có prefix).
- Bật theo `KAFKA_DLQ_TOPIC_ENABLED` (mặc định `true`). `false` → `NoopOutboxDlqPublisher`.
- Publish chỉ khi `publish_attempts >= EVENT_OUTBOX_MAX_ATTEMPTS` (outbox row đã được set `dead_lettered_at`).
- Payload bao gồm event gốc + metadata (`deadLetteredAt`, `publishAttempts`, `lastError`, `originalTopic`).
- DLQ publish fail **không** chặn relay loop (catch + log).

### 6.3 Outbox relay (`outbox-relay.service.ts`)

- Tần suất: `@Cron(EVERY_10_SECONDS)` ở `OutboxRelayEnqueueScheduler` → enqueue job `flush` vào Bull queue `OUTBOX_RELAY_QUEUE` → `OutboxRelayProcessor.handleFlush` gọi `flushOnce()`.
- Distributed lock qua `withDistributedLock(redisService, { lockKey: 'outbox:relay:lock', ttlSeconds: 45 })`.
- Trong lock: lặp tối đa 50 row, mỗi row là 1 transaction riêng (`pessimistic_write` + `skip_locked`).
- Sau flush thành công, retry tối đa `DEAD_LETTER_RETRY_PER_FLUSH` dead-letter rows cũ nhất (round-robin; default 5).
- **Bounded DLQ retry (mới 2026-08-16)**: cột `integration_outbox.dlq_retry_count` được atomic increment mỗi lần reset dead-letter. SQL guard `COALESCE(dlq_retry_count, 0) < :max` (max = `EVENT_OUTBOX_DLQ_MAX_RETRIES`, default 3) đảm bảo poisoned message không churn vô hạn. Khi budget cạn, relay increment metric `outbox_relay_dlq_retry_skipped_total{event_type=…}` + log warn; row nằm yên trong dead-letter state cho đến khi operator replay thủ công qua `POST /admin/outbox/{id}/replay`.
- Metrics: `outbox_unpublished_rows`, `outbox_dead_letter_rows`, `outbox_retry_scheduled_rows`, `outbox_oldest_unpublished_age_seconds`, `outbox_oldest_dead_letter_age_seconds`, `outbox_flush_duration_seconds`, `outbox_relay_published_total`, `outbox_relay_failures_total`, `outbox_relay_dead_lettered_total`, `outbox_relay_dlq_retry_skipped_total`.

### 6.3.1 Producer config (`kafka-outbox-event-publisher.service.ts`)

- `idempotent=true` (kafkajs tự gắn producer-id + sequence number vào mỗi batch → broker dedupe retries trong cùng session).
- `maxInFlightRequests` mặc định 1; `kafkajs` tự cap ≤5 khi idempotent. Có thể nâng lên 2-5 nếu throughput cao quan trọng hơn strict per-partition ordering.
- `acks=-1` (forced bởi `kafkajs` khi idempotent=true — không thể override xuống `0`/`1`).
- Log khi connect: `Kafka outbox publisher connected brokers=… idempotent=true maxInFlight=1 acks=-1`.

### 6.4 Why `EVENT_PUBLISHER_DRIVER=noop` mặc định?

Đây là thiết kế cố ý (xem `docs/ARCHITECTURE.md`, ADR-001):

- Cho phép dev chạy full stack không cần Kafka container — không phải ai cũng cần event bus để dev feature.
- Mặc định `noop` + env doc cảnh báo "Uncomment and set EVENT_PUBLISHER_DRIVER=kafka when Kafka container is running" → operator chủ động bật khi cần.
- Outbox row + projection sync vẫn hoạt động bình thường vì dispatcher (`OutboxIntegrationSyncService`) đọc lại từ `processed_integration_events`, không phụ thuộc publisher có gửi Kafka hay không.

---

## 7. Go services dùng Kafka như thế nào?

`docker-compose.development.yml` mount 3 Go service (`market-aggregator`, `matching-engine`, `public-ws-gateway`) với env:

```yaml
KAFKA_BROKERS=kafka:9092
```

Lưu ý: khi Go services giao tiếp Kafka từ **bên trong** Docker network thì dùng `kafka:9092` (listener nội bộ PLAINTEXT). Khi truy cập từ **host** (dev tool, Node.js script `create-kafka-topics.js`) thì dùng `localhost:29092` (listener PLAINTEXT_EXTERNAL đã được `ports:` map ra host).

Đây là lý do compose khai 2 listener ngoài (`KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_EXTERNAL:PLAINTEXT` — listener thứ 3 là `CONTROLLER` cho Raft quorum, không advertise) — Go service thấy broker qua DNS nội bộ, code dev thấy qua localhost.

`go-services/market-aggregator/internal/app/app.go`, `go-services/matching-engine/internal/app/app.go`, `go-services/public-ws-gateway/internal/app/app.go` đều có consumer/producer Kafka — xem chi tiết trong `go-services/docs/` (matching-engine.md, metrics-reference.md).

---

## 8. Checklist vận hành Kafka local

1. **Profile `kafka` đã bật?** Kiểm tra `docker ps | grep kafka` (chỉ 1 container Kafka, không còn Zookeeper).
2. **Backend env `EVENT_PUBLISHER_DRIVER` khớp?** `kafka` ↔ container đang chạy, `noop` ↔ không có container (hoặc muốn test mà không cần Kafka).
3. **`KAFKA_BROKERS` đúng listener?** Trong container network: `kafka:9092`. Từ host: `localhost:29092`.
4. **Restart an toàn?** Dùng `docker compose stop` rồi `start`, không dùng `kill` / tắt Docker Desktop cưỡng bức.
5. **Volume integrity?** Sau crash cứng / cắt điện, chạy `npm run docker:kafka:cleanup`.
6. **Backend có kết nối?** Bật `EVENT_PUBLISHER_DRIVER=kafka`, restart NestJS, kiểm tra log `"Kafka outbox publisher connected brokers=... idempotent=true maxInFlight=1 acks=-1"`. Nếu không thấy, kiểm tra `circuit_breaker_state{name="kafka-producer"}` ở `/metrics` (0 = CLOSED).
7. **Outbox có tiến triển?** `/api/v1/admin/outbox/stats` (qua `OutboxAdminService`) — `unpublishedRows`, `deadLetterRows`, `oldestUnpublishedAgeSeconds`.
8. **JMX exporter hoạt động?** `curl -s http://localhost:9191/metrics | grep '^kafka_' | head` — phải thấy ~600 metrics (JVM heap, controller, request rates, raft state). Nếu chỉ thấy `jmx_*` self-metrics, kiểm tra pattern syntax trong `monitoring/kafka-jmx-exporter.yml` (xem [`docs/kafka-kraft.md`](kafka-kraft.md#10-jmx-exporter--prometheus-scrape)).
9. **KRaft controller active?** `kafka_controller_active_count == 1`, `kafka_server_raft_metrics_current_state{state="leader"} == 1`. Alert `KafkaControllerInactive` page khi mất controller > 2 phút.
10. **DLQ budget?** Metric `outbox_relay_dlq_retry_skipped_total` > 0 → có poisoned message đã exhausted retry; replay qua admin API.

---

## 9. Roadmap / open questions (tham chiếu)

Từ `docs/KAFKA_EVENT_BUS_SOURCE_OF_TRUTH_PLAN.md` (archive) + audit 2026-07-28:

- **Phase 5d (Kafka consumer migration)** — scaffold xong, chưa bật mặc định. Cần quyết định khi nào volume đủ lớn để chuyển từ `processed_integration_events` polling sang Kafka consumer.
- **Phase 5c (ClickHouse audit consumer)** — đã có service (`src/common/clickhouse/clickhouse-audit-consumer.service.ts`), chưa có table schema runtime.
- **KRaft mode** — ✅ Done (2026-08-16). Đã thay Zookeeper bằng KRaft combined mode (`PROCESS_ROLES=broker,controller`, controller listener `:9093`, `CLUSTER_ID` cố định). Cấu hình + rollback + recovery nằm trong [`docs/kafka-kraft.md`](kafka-kraft.md). Cleanup script giờ chỉ quản lý volume `kafka_data`.
- **Idempotent producer + bounded DLQ retry** — ✅ Done (2026-08-16). Xem [`docs/kafka-kraft.md`](kafka-kraft.md#9-idempotent-producer--bounded-dlq-retry) + §6.3, §6.3.1 trong file này.
- **Kafka JMX exporter + Prometheus scrape** — ✅ Done (2026-08-16). Sidecar + Prometheus scrape job + 3 alert rules. Xem [`docs/kafka-kraft.md`](kafka-kraft.md#10-jmx-exporter--prometheus-scrape).
- **Production readiness**:
  - SASL/SSL chưa có env.
  - Replication factor = 1 (single broker) — không HA.
  - Schema registry chưa có, dùng inline JSON schema với `schemaVersion` trong envelope.
  - `KAFKA_CLUSTER_ID` đã có env var nhưng chưa được dùng trong compose (Confluent image auto-generate).

---

## 10. Tham chiếu nhanh (file:line)

| Mối quan tâm | File |
|---|---|
| Compose Kafka (KRaft) hiện tại | `docker-compose.infrastructure.development.yml` (xem [`docs/kafka-kraft.md`](kafka-kraft.md) để biết chi tiết KRaft env block) |
| Go services gọi Kafka | `docker-compose.development.yml:47-49,78-79,107-108` |
| Env Kafka (validation) | `src/config/env.validation.ts:213-234` |
| Env Kafka (config namespace) | `src/config/app.config.ts:516-521` |
| Producer (kafkajs) | `src/common/outbox/kafka-outbox-event-publisher.service.ts` |
| DLQ publisher | `src/common/outbox/kafka-outbox-dlq-publisher.service.ts` |
| Producer Circuit Breaker | `src/common/outbox/kafka-producer-circuit-breaker.service.ts` |
| Circuit Breaker generic | `src/common/outbox/circuit-breaker.ts` |
| Driver factory (noop/kafka) | `src/common/outbox/outbox.module.ts:91-118` |
| Outbox relay core | `src/common/outbox/outbox-relay.service.ts` |
| Outbox scheduler 10s | `src/common/outbox/outbox-relay.enqueue.scheduler.ts` |
| Outbox appender (cùng tx) | `src/common/outbox/outbox-appender.service.ts` |
| Envelope canonical | `src/common/integration-events/canonical-integration-event-envelope.ts` |
| Event catalog (15+ types) | `src/common/integration-events/integration-event-catalog.ts` |
| Kafka module (consumer) | `src/common/kafka/kafka.module.ts`, `kafka-consumer-runner.service.ts` |
| Runtime setting `KAFKA_DLQ_TOPIC_ENABLED` | `src/modules/system-config/runtime-settings.definitions.ts:423-430` |
| `docker:kafka:cleanup` script | `package.json:50` → `scripts/docker/cleanup-kafka-volumes.js` |
| Topic tạo sẵn (legacy) | `scripts/create-kafka-topics.js` |
| Env example | `.env.development.example` dòng 26-36 |