# Infrastructure Documentation

> **Status (2026-07-28):** Superseded by `docs/ARCHITECTURE.md`, `docs/ARCHITECTURE_FULL_ROLLOUT.md`, `docs/ENV_CONFIG_USAGE.md`, `docs/MONITORING_DEPLOYMENT_NOTES.md`. Tài liệu này rất lớn (~45KB) và phản ánh trạng thái cũ (multi-DB roadmap 2026-04). Giữ làm **historical reference**; **không dùng để chạy** stack mới. Đề xuất chuyển vào `docs/archive/` sau khi user xác nhận (xem báo cáo cuối của audit 2026-07-28).
>
> Phần bao quát: Docker/Kubernetes, Database (PostgreSQL, TimescaleDB, ClickHouse), Redis, Kafka, BullMQ, Authentication, Logging/Monitoring/Tracing, CI/CD, và environment configuration.

---

## 1. Tổng Quan Kiến Trúc Infrastructure

Backend sử dụng kiến trúc multi-database với event-driven communication thông qua Kafka và BullMQ.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client (Flutter/Web)                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP / WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  NestJS Application          Port: ${APP_PORT:-3000}            │
│  Prefix: /api/v1                                          │
│  ├── Swagger UI     → /api/docs                               │
│  ├── Bull Board     → /admin/queues (JWT + ADMIN)            │
│  ├── Prometheus     → /metrics                                │
│  └── Health         → /api/v1/health, /api/v1/health/ready   │
└──────┬──────────────┬──────────────┬───────────────┬───────────┘
       │              │              │               │
       │ TypeORM      │ ioredis      │ BullMQ        │ KafkaJS
       ▼              ▼              ▼               ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│PostgreSQL │  │  Redis   │  │  Redis   │  │  Kafka   │
│ Core DB   │  │ (Cache)  │  │ (BullMQ) │  │ (Events) │
│ port 5432 │  │ port 6379│  │ port 6379│  │ port 9092│
└─────┬─────┘  └──────────┘  └────┬─────┘  └────┬─────┘
      │                            │              │
      │                            │              │
      ▼                            ▼              ▼
┌──────────────┐           ┌──────────┐  ┌──────────┐
│ TimescaleDB  │           │ BullMQ   │  │ Projection│
│ Market OHLCV │           │ Consumers│  │ Consumers │
│ port 5433   │           └──────────┘  └────┬─────┘
└─────┬────────┘                              │
      ▼                                        ▼
┌──────────────────┐                  ┌──────────────────┐
│    ClickHouse     │                  │ Read Models      │
│ Analytics/Audit  │                  │ (PostgreSQL)      │
│ port 8123        │                  │                   │
└──────────────────┘                  └──────────────────┘
```

---

## 2. Docker Compose Infrastructure

### 2.1 Docker Compose File

**File:** `docker-compose.infrastructure.yml`

Cấu hình sử dụng **Docker Compose profiles** để linh hoạt khởi động từng nhóm service.

#### 2.1.1 Services Luôn Chạy (no profile)

**PostgreSQL — Core Database**

```yaml
postgres:
  image: postgres:16-alpine
  container_name: crypto_trading_postgres
  restart: unless-stopped
  environment:
    POSTGRES_USER:     ${CORE_DB_USERNAME}
    POSTGRES_PASSWORD: ${CORE_DB_PASSWORD}
    POSTGRES_DB:       ${CORE_DB_NAME}
    TZ: Asia/Ho_Chi_Minh
    PGTZ: Asia/Ho_Chi_Minh
  ports:
    - "${CORE_DB_PORT:-5432}:5432"
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./init-scripts/postgres:/docker-entrypoint-initdb.d:ro
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${CORE_DB_USERNAME}"]
    interval: 10s
    timeout: 5s
    retries: 5
  command: >
    -c max_connections=200
    -c shared_buffers=256MB
    -c effective_cache_size=512MB
    -c maintenance_work_mem=64MB
    -c checkpoint_completion_target=0.9
    -c wal_buffers=16MB
    -c default_statistics_target=100
    -c random_page_cost=1.1
    -c effective_io_concurrency=200
    -c max_worker_processes=8
    -c max_parallel_workers_per_gather=4
    -c max_parallel_workers=8
    -c max_parallel_maintenance_workers=4
```

**Redis**

```yaml
redis:
  image: redis:7-alpine
  container_name: crypto_trading_redis
  restart: unless-stopped
  ports:
    - "${REDIS_PORT:-6379}:6379"
  volumes:
    - redis_data:/data
  command: >
    redis-server
    --save 60 1
    --save 300 10
    --save 3600 100
    --appendonly yes
    --maxmemory 256mb
    --maxmemory-policy allkeys-lru
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 3s
    retries: 3
```

#### 2.1.2 Services Profile `kafka`

```yaml
zookeeper:
  image: confluentinc/cp-zookeeper:7.6.1
  container_name: crypto_trading_zookeeper
  environment:
    ZOOKEEPER_CLIENT_PORT: 2181
    ZOOKEEPER_TICK_TIME: 2000

kafka:
  image: confluentinc/cp-kafka:7.6.1
  container_name: crypto_trading_kafka
  depends_on:
    zookeeper:
      condition: service_healthy
  ports:
    - "${KAFKA_PORT:-29092}:9092"       # external
    - "${KAFKA_INTERNAL_PORT:-9092}:9094" # internal (inside network)
  environment:
    KAFKA_BROKER_ID: 1
    KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT,PLAINTEXT_EXTERNAL:PLAINTEXT
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092,PLAINTEXT_EXTERNAL://localhost:29092
    KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
    KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
    KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    KAFKA_LOG_RETENTION_HOURS: 168
    KAFKA_LOG_RETENTION_BYTES: -1
    KAFKA_NUM_PARTITIONS: 6
    KAFKA_DEFAULT_REPLICATION_FACTOR: 1
    KAFKA_LOG_CLEANER_ENABLE: "true"
    KAFKA_CONNECTIONS_MAX_IDLE_MS: 300000
    KAFKA_REQUEST_TIMEOUT_MS: 30000
    KAFKA_SESSION_TIMEOUT_MS: 30000
    KAFKA_HEARTBEAT_INTERVAL_MS: 10000
  healthcheck:
    test: ["CMD-SHELL", "kafka-broker-api-versions --bootstrap-server localhost:9092 || exit 1"]
    interval: 15s
    timeout: 10s
    retries: 10
```

#### 2.1.3 Services Profile `clickhouse`

```yaml
clickhouse:
  image: clickhouse/clickhouse-server:24.6-alpine
  container_name: crypto_trading_clickhouse
  restart: unless-stopped
  ports:
    - "${CLICKHOUSE_HTTP_PORT:-8123}:8123"
    - "${CLICKHOUSE_TCP_PORT:-9000}:9000"
  environment:
    CLICKHOUSE_DB: analytics
    CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: 1
  volumes:
    - clickhouse_data:/var/lib/clickhouse
    - ./scripts/docker/clickhouse-init.sql:/docker-entrypoint-initdb.d/init.sql:ro
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "localhost:8124/ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

#### 2.1.4 Services Profile `timescale`

```yaml
timescaledb:
  image: timescale/timescaledb:2.17.2-pg16
  container_name: crypto_trading_timescaledb
  restart: unless-stopped
  ports:
    - "${MARKET_TS_PORT:-5433}:5432"
  environment:
    POSTGRES_USER:     ${MARKET_TS_DB_USERNAME}
    POSTGRES_PASSWORD: ${MARKET_TS_DB_PASSWORD}
    POSTGRES_DB:       ${MARKET_TS_DB_NAME}
  volumes:
    - timescaledb_data:/var/lib/postgresql/data
  command: >
    postgres
    -c max_connections=200
    -c shared_buffers=512MB
    -c effective_cache_size=1GB
    -c maintenance_work_mem=128MB
    -cTimescaleDB license=timescale
```

### 2.2 Scripts Hạ Tầng

**Cleanup Kafka Volumes**

Khi Kafka gặp lỗi `NodeExistsException` (thường do crash không clean), chạy:

```bash
# PowerShell
.\scripts\docker\cleanup-kafka-volumes.ps1

# Bash
bash scripts/docker/cleanup-kafka-volumes.sh
```

Script sẽ xóa các Kafka volumes và Zookeeper data để bootstrap lại từ đầu.

**ClickHouse Init SQL**

File `scripts/docker/clickhouse-init.sql` tạo schema cho analytics:

```sql
CREATE DATABASE IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.event_audit_log
(
    event_id     String,
    event_type   String,
    aggregate_id String,
    payload      String,
    metadata     String,
    created_at   DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (event_id, created_at)
TTL created_at + INTERVAL 12 MONTH;

CREATE TABLE IF NOT EXISTS analytics.order_stats
(
    order_id     String,
    user_id      String,
    symbol       String,
    side         String,
    price        Decimal(20, 8),
    quantity     Decimal(20, 8),
    filled       Decimal(20, 8),
    status       String,
    created_at   DateTime DEFAULT now()
)
ENGINE = SummingMergeTree()
ORDER BY (symbol, created_at)
TTL created_at + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.order_stats_mv
TO analytics.order_stats
AS SELECT order_id, user_id, symbol, side, price, quantity, filled, status, now() AS created_at
FROM system.events;
```

### 2.3 Kubernetes

**Hiện tại không có Kubernetes manifests.** Dự án chỉ sử dụng Docker Compose cho local development và staging.

---

## 3. Database Infrastructure

### 3.1 PostgreSQL — Core Database

| Property | Value |
|----------|-------|
| Engine | PostgreSQL 16 (Alpine) |
| Container | `crypto_trading_postgres` |
| Port | `5432` |
| Driver | TypeORM, `pg` |
| Synchronize | `false` (migrations only) |
| SSL | `false` (dev), configurable via env |
| Pool | max 10 connections, `statement_timeout: 30000ms` |

**Migrations:**

Chạy migrations qua CLI script:

```bash
# Development
npm run db:migrate

# Seed data
npm run db:seed

# Production — chạy qua script
npx ts-node src/seed/run-migrations.ts
```

Migrations tự động detect từ `src/migrations/`. File migration mẫu:

```typescript
// src/migrations/1600000000000-BaselinePostgresSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselinePostgresSchema1700000000000 implements MigrationInterface {
  name = 'BaselinePostgresSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tạo extensions
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // Tạo tables: users, orders, wallets, v.v.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback logic
  }
}
```

**Connection Pooling Settings:**

```typescript
extra: {
  max: 10,
  statement_timeout: 30000,
  idle_in_transaction_session_timeout: 30000,
  pool: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000,
  },
}
```

### 3.2 TimescaleDB — Market Data

| Property | Value |
|----------|-------|
| Engine | TimescaleDB 2.17.2 trên PostgreSQL 16 |
| Container | `crypto_trading_timescaledb` |
| Port | `5433` |
| Mục đích | Market OHLCV time-series data |
| Feature flags | `MARKET_TS_TIMESCALE_ENABLED`, `MARKET_TS_RETENTION_ENABLED`, `MARKET_TS_COMPRESSION_ENABLED` |

**Hypertable Migration:**

```sql
-- src/migrations/1800000001006-EnableTimescaleHypertable.sql
SELECT create_hypertable(
  'read_market_ohlcv',
  'timestamp',
  chunk_time_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Retention policy
SELECT add_retention_policy(
  'read_market_ohlcv',
  INTERVAL '30 days',
  if_not_exists => TRUE
);

-- Compression policy (sau 7 ngày)
ALTER TABLE read_market_ohlcv
SET (
  timescaledb.compression,
  timescaledb.compression_segmentby = 'symbol'
);

SELECT add_compression_policy(
  'read_market_ohlcv',
  INTERVAL '7 days',
  if_not_exists => TRUE
);
```

**Compression Settings:**

| Chunk Interval | Compression | Retention |
|---|---|---|
| 1 giờ | Bật sau 7 ngày | 30 ngày |

### 3.3 ClickHouse — Analytics

| Property | Value |
|----------|-------|
| Engine | ClickHouse 24.6 (Alpine) |
| Container | `crypto_trading_clickhouse` |
| HTTP Port | `8123` |
| TCP Port | `9000` |
| Database | `analytics` |
| Mục đích | Event audit log, order stats, balance aggregates |

**Tables:**

| Table | Engine | TTL | Mục đích |
|-------|--------|-----|---------|
| `event_audit_log` | MergeTree | 12 tháng | Tất cả integration events |
| `order_stats` | SummingMergeTree | 90 ngày | Order analytics |
| `balance_aggregates` | SummingMergeTree | 90 ngày | Balance snapshots |

### 3.4 Database Providers (TypeORM DataSources)

Ba DataSource riêng biệt được inject qua NestJS DI:

```typescript
// src/config/database.providers.ts
export const CORE_DB = 'CORE_DB';
export const MARKET_TS_DB = 'MARKET_TS_DB';
export const ANALYTICS_DB = 'ANALYTICS_DB';

// TypeORMModule.forRootAsync()
//   imports: [ConfigModule],
//   inject: [AppConfig],
//   useFactory: (config: AppConfig) => ({
//     type: 'postgres',
//     host: config.coreDb.host,
//     ...
//   }),
```

**Entity Locations:**

| Database | Entity glob paths |
|----------|------------------|
| Core DB | `src/entities/*.entity.ts`, `src/modules/**/entities/*.entity.ts` |
| TimescaleDB | `src/modules/markets/entities/read-market-ohlcv.entity.ts` |

---

## 4. Redis Infrastructure

### 4.1 Connection Architecture

**File:** `src/common/services/redis.service.ts`

Sử dụng 3 kết nối ioredis riêng biệt:

```typescript
@Injectable()
export class RedisService {
  private readonly client: Redis;
  private readonly subscriber: Redis;
  private readonly publisher: Redis;

  constructor() {
    // Kết nối tự động, graceful degradation
    this.client    = new Redis({ host, port, password, timeout: 10000 });
    this.subscriber = new Redis({ host, port, password, timeout: 10000 });
    this.publisher  = new Redis({ host, port, password, timeout: 10000 });

    // Exponential backoff retry
    // maxRetriesPerRequest: null cho hỗ trợ BullMQ
  }
}
```

| Connection | Mục đích | Chế độ |
|------------|----------|--------|
| `client` | General operations (cache, locks) | Blocking |
| `subscriber` | Pub/Sub receive | Blocking |
| `publisher` | Pub/Sub send | Blocking |

### 4.2 Operations

| Command | Redis Op | Mô tả |
|---------|----------|--------|
| Cache value | `SETEX`, `SET ... NX EX` | TTL-based caching |
| Get value | `GET` | Read cache |
| Delete key | `DEL` | Invalidate cache |
| Counter | `INCR`/`INCRBY`/`DECR`/`DECRBY` | Rate limiting, counters |
| Hash | `HSET`/`HGET`/`HGETALL` | Structured data |
| Set | `SADD`/`SREM`/`SISMEMBER` | Member tracking |
| Pub/Sub | `PUBLISH`/`SUBSCRIBE` | Real-time events |
| Distributed Lock | `SET ... NX EX` | Outbox relay, critical sections |
| Pattern scan | `SCAN` | Key iteration |

### 4.3 BullMQ Integration

Redis đồng thời là backend cho BullMQ queues. Cấu hình BullMQ dùng chung Redis connection:

```typescript
BullModule.forRootAsync({
  inject: [RedisService],
  useFactory: (redis: RedisService) => ({
    redis: {
      host: redis.host,
      port: redis.port,
      password: redis.password,
      maxRetriesPerRequest: null, // bắt buộc cho BullMQ
    },
  }),
})
```

**Bull Board UI** (monitoring queues): `/admin/queues` — protected bởi JWT + ADMIN role.

---

## 5. Message Queue Infrastructure

### 5.1 Kafka — Event Bus

#### 5.1.1 KafkaJS Configuration

**File:** `src/common/outbox/kafka-outbox-event-publisher.service.ts`

```typescript
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID ?? 'crypto-trading-backend-outbox',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:29092').split(','),
  requestTimeout: Number(process.env.KAFKA_REQUEST_TIMEOUT_MS ?? 30000),
  connectionTimeout: Number(process.env.KAFKA_CONNECTION_TIMEOUT_MS ?? 10000),
  retry: {
    initialRetryTime: 100,
    retries: 5,
  },
});

const producer = kafka.producer({
  createPartitioner: DefaultPartitioner,
  idempotent: true,
  maxInFlightRequests: 1,
});
```

#### 5.1.2 Topic Resolution

Events được publish theo pattern:

```
{prefix}.{event_type_lowercase}
```

Ví dụ: `crypto-trading.order.placed`, `crypto-trading.trade.executed`

**Topic Resolution Logic:**

```typescript
// Ưu tiên 1: Explicit topic trong event metadata
if (row.kafka_topic) return row.kafka_topic;

// Ưu tiên 2: Topic prefix + event type
return `${KAFKA_TOPIC_PREFIX}.${eventType.toLowerCase()}`;
```

#### 5.1.3 Circuit Breaker Pattern

Producer được bọc trong `KafkaProducerCircuitBreakerService`:

```
CLOSED (normal) → OPEN (failure threshold exceeded) → HALF_OPEN (test request) → CLOSED | OPEN
```

| Metric | Threshold |
|--------|-----------|
| Failure threshold | 5 consecutive failures |
| Open state duration | 30 giây |
| Half-open test | 1 request |

**Prometheus metrics:**
- `circuit_breaker_state{g name="kafka-producer"}` — current state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)
- `circuit_breaker_tripped_total` — số lần trip

#### 5.1.4 Dead Letter Queue (DLQ)

Khi publish thất bại sau `maxAttempts`:

1. `OutboxRelayService` mark row là `dead_lettered = true`
2. `KafkaOutboxDlqPublisher` publish sang DLQ topic
3. Metrics: `outbox_dlq_published_total`, `outbox_dlq_publish_failures_total`

### 5.2 Transactional Outbox Pattern

#### 5.2.1 Flow

```
┌──────────────────────┐
│  Business Transaction  │
│  (NestJS Service)      │
└──────────┬───────────┘
           │ BEGIN TRANSACTION
           ▼
┌──────────────────────┐
│  1. Persist business  │
│     data (Entity)      │
│  2. Append to          │
│     integration_outbox │
└──────────┬───────────┘
           │ COMMIT
           ▼
┌──────────────────────┐    ┌──────────────────┐
│  OutboxRelayService   │───▶│  Kafka Producer   │
│  (Background process)  │    │  (kafkajs)        │
│  FOR UPDATE SKIP LOCKED│    └────────┬─────────┘
└──────────┬───────────┘             │
           │                         ▼
           │              ┌──────────────────┐
           └──────────────▶│  DLQ Publisher   │
                           └──────────────────┘
```

#### 5.2.2 Outbox Table Schema

```typescript
// src/entities/integration-outbox.entity.ts
@Entity('integration_outbox')
export class IntegrationOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  aggregate_type: string;       // e.g., 'order', 'trade', 'wallet'

  @Column({ type: 'varchar', length: 100 })
  aggregate_id: string;         // UUID của aggregate

  @Column({ type: 'varchar', length: 100 })
  event_type: string;           // e.g., 'ORDER_PLACED', 'TRADE_EXECUTED'

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  kafka_topic: string;          // Optional explicit topic

  @Column({ type: 'integer', default: 0 })
  publish_attempts: number;

  @Column({ type: 'timestamp', nullable: true })
  published_at: Date;

  @Column({ type: 'boolean', default: false })
  dead_lettered: boolean;

  @Column({ type: 'integer', nullable: true })
  kafka_partition: number;

  @Column({ type: 'varchar', nullable: true })
  kafka_offset: string;

  @Column({ type: 'timestamp', default: 'now()' })
  created_at: Date;

  @Column({ type: 'integer', default: 0 })
  retry_count: number;
}
```

#### 5.2.3 Driver Options

```typescript
// src/common/outbox/outbox.module.ts
export const EVENT_PUBLISHER_DRIVER = {
  noop:   'noop',   // dev: skip publishing, just mark as published
  kafka:  'kafka',   // prod: publish to Kafka
  redis:  'redis',  // future: Redis Streams driver
  bullmq: 'bullmq', // future: BullMQ driver
};
```

#### 5.2.4 Flush Strategy

- **Lock:** Distributed lock (`outbox:relay:lock`, TTL 45s) qua Redis
- **Batch size:** 50 rows per flush cycle
- **Row selection:** `FOR UPDATE SKIP LOCKED` (pessimistic write, tránh race condition)
- **Scheduling:** `OutboxRelayEnqueueScheduler` (Cron: mỗi 5 giây)
- **Retry:** Exponential backoff, max `EVENT_OUTBOX_MAX_ATTEMPTS`

### 5.3 BullMQ — Job Queues

**Bull Board:** `GET /admin/queues` (protected JWT + ADMIN role)

| Queue | Module | Mục đích | Concurrency |
|-------|--------|---------|-------------|
| `matching` | `MatchingModule` | Order matching jobs | Configurable |
| `treasury` | `TreasuryModule` | Treasury hot wallet operations | 1 |
| `payment-config` | `PaymentConfigModule` | PayOS grace period checks | 1 |
| `outbox-relay` | `OutboxModule` | Outbox flush relay jobs | 2 |
| `deposit-watcher` | `BlockchainDepositWatcherModule` | On-chain deposit watching | 3 |

**Job retry policy mặc định:**

```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s, 2s, 4s
  },
  removeOnComplete: true,
  removeOnFail: false, // giữ lại để debug
}
```

---

## 6. Authentication & Authorization

### 6.1 Authentication Methods

| Method | Flow | Files |
|--------|------|-------|
| Email + Password | Register → Login → JWT | `auth.service.ts`, `login-with-password.use-case.ts` |
| Wallet (ECDSA) | Sign message → Verify signature → JWT | `wallet-auth.service.ts` |
| WalletConnect / Reown | OAuth-style v2 protocol | `wallet-connect-auth.service.ts` |
| 2FA (TOTP) | Enable → Verify → Login with 2FA | `two-fa.service.ts` |

### 6.2 JWT Configuration

```typescript
JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [AppConfig],
  useFactory: (config: AppConfig) => ({
    secret: config.jwt.secret,
    signOptions: { expiresIn: '24h' },
    verifyOptions: { ignoreExpiration: false },
  }),
})
```

**JWT Payload:**

```typescript
interface JwtPayload {
  sub: string;       // user ID
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}
```

### 6.3 User Roles (RBAC)

```typescript
enum UserRole {
  TRADER         = 'TRADER',
  ADMIN          = 'ADMIN',
  RISK_OFFICER   = 'RISK_OFFICER',
  SUPPORT_AGENT  = 'SUPPORT_AGENT',
  MARKET_MAKER   = 'MARKET_MAKER',
  FINANCE_MANAGER = 'FINANCE_MANAGER',
}
```

**Role-based guards:**
- `@UseGuards(JwtAuthGuard, RolesGuard)`
- `@Roles(Role.ADMIN)` — chỉ ADMIN được truy cập
- Bull Board: JWT + ADMIN check middleware

### 6.4 Password Security

- **Hashing:** bcrypt (`BCRYPT_ROUNDS`, default: 10)
- **Change password:** via `ChangePasswordUseCase` (require current password)

### 6.5 Wallet Auth

**EVM chains:**
```typescript
// Verify signed message
const recovered = ethers.verifyMessage(message, signature);
// Compare recovered address with stored address
```

**Tron:**
```typescript
const TronWeb = require('tronweb');
const recovered = TronWeb.utils.address.fromHex(
  TronWeb.trx.verifyMessage(message, signature)
);
```

**Solana:**
```typescript
const { verify } = require('noble-ed25519');
const recovered = await verify(signature, new TextEncoder().encode(message), publicKey);
```

### 6.6 WalletConnect v2

- **Web3Modal:** React component (Flutter WebView integration)
- **Web3 wallets:** MetaMask, Trust Wallet, v.v.
- **Webhook:** `WALLETCONNECT_WEBHOOK_SECRET` để verify incoming events

---

## 7. Logging, Monitoring & Tracing

### 7.1 Logging

**Framework:** Pino (`pino`, `pino-pretty`)

**Log Levels:**

| Level | Mô tả | Usage |
|-------|--------|-------|
| `trace` | Debug chi tiết | Dev only |
| `debug` | Debug thông thường | Dev only |
| `info` | Thông tin operation | All environments |
| `warn` | Cảnh báo (4xx responses) | All environments |
| `error` | Lỗi (5xx, exceptions) | All environments |

**Log Format:**
- **Development:** Pretty-printed (colored, formatted)
- **Production:** JSON format (structured)

**Correlation ID:**
- `CorrelationIdMiddleware` gắn `X-Correlation-ID` vào mọi request
- Propagated qua Kafka spans và BullMQ job metadata

### 7.2 Prometheus Metrics

**Endpoint:** `GET /metrics` (Prometheus text format)

#### HTTP Metrics

```
# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.005",method="GET",route="/api/v1/health",status="200"} 123
http_request_duration_seconds_bucket{le="0.01",...} 456
http_request_duration_seconds_bucket{le="0.025",...} 789
http_request_duration_seconds_bucket{le="0.05",...} 890
http_request_duration_seconds_bucket{le="0.1",...} 950
http_request_duration_seconds_bucket{le="0.25",...} 990
http_request_duration_seconds_bucket{le="0.5",...} 999
http_request_duration_seconds_bucket{le="1",...} 1000
http_request_duration_seconds_bucket{le="2.5",...} 1000
http_request_duration_seconds_bucket{le="5",...} 1000
http_request_duration_seconds_bucket{le="10",...} 1000
http_request_duration_seconds_bucket{le="+Inf",...} 1000
http_request_duration_seconds_sum{method="GET",...} 45.67
http_request_duration_seconds_count{method="GET",...} 1000
```

**Histogram buckets:** 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s

#### Custom Metrics

| Metric | Type | Labels | Mô tả |
|--------|------|--------|--------|
| `matching_queue_depth` | Gauge | `pair` | Số lượng order trong queue |
| `orders_total` | Counter | `pair`, `side`, `type` | Tổng orders |
| `trades_total` | Counter | `pair` | Tổng trades |
| `blockchain_rpc_duration_seconds` | Histogram | `chain`, `method` | RPC call latency |
| `outbox_unpublished_rows` | Gauge | — | Số row chưa publish |
| `outbox_dead_letter_rows` | Gauge | — | Số row trong DLQ |
| `outbox_relay_published_total` | Counter | — | Tổng publish thành công |
| `outbox_relay_failures_total` | Counter | — | Tổng publish thất bại |
| `outbox_relay_dead_lettered_total` | Counter | — | Tổng dead-lettered |
| `outbox_flush_duration_seconds` | Histogram | — | Thời gian flush |
| `kafka_publish_duration_seconds` | Histogram | `topic` | Kafka publish latency |
| `projection_consumer_processed_total` | Counter | `consumer` | Projection processed |
| `projection_consumer_failures_total` | Counter | `consumer` | Projection failures |
| `projection_consumer_state` | Gauge | `consumer` | Circuit breaker state |
| `market_read_model_trade_drift` | Gauge | `pair` | Trade drift vs exchange |
| `market_read_model_ticker_drift` | Gauge | `pair` | Ticker drift |
| `market_read_model_ohlcv_drift` | Gauge | `pair`, `interval` | OHLCV drift |
| `market_read_model_projection_lag_seconds` | Gauge | `pair` | Projection lag |
| `reconciliation_balance_drift_total` | Counter | `wallet`, `currency` | Balance mismatch |
| `reconciliation_trades_mismatch` | Gauge | `pair` | Trade count mismatch |
| `reconciliation_job_duration_seconds` | Histogram | `job_type` | Reconciliation duration |
| `circuit_breaker_state` | Gauge | `name` | Circuit breaker state |
| `circuit_breaker_tripped_total` | Counter | `name` | Số lần trip |

### 7.3 OpenTelemetry Tracing

**File:** `src/telemetry/telemetry.module.ts`

```typescript
// Auto-instrumentation
sdk.start();

// Manual span creation
const span = tracer.startSpan('kafka.publish', {
  attributes: {
    'messaging.system': 'kafka',
    'messaging.destination': topic,
    'messaging.kafka.partition': partition,
  },
});
```

**Spans được capture:**
- HTTP requests (via auto-instrumentation)
- Kafka produce / consume
- Database queries
- Redis operations
- RPC calls (blockchain)

### 7.4 Health Checks

**Liveness:** `GET /api/v1/health`

```json
{ "ok": true, "timestamp": "2026-05-21T04:00:00.000Z" }
```

**Readiness:** `GET /api/v1/health/ready`

```json
{
  "ok": true,
  "checks": [
    { "name": "postgres", "status": "up", "latencyMs": 2 },
    { "name": "redis", "status": "up", "latencyMs": 1 },
    { "name": "outbox", "status": "up", "unpublishedRows": 0, "dlqRows": 0 },
    { "name": "market_ts", "status": "up", "latencyMs": 3 },
    { "name": "market_read_model", "status": "up", "lagMs": 150 },
    { "name": "go_rollout", "status": "up" },
    { "name": "analytics_db", "status": "up", "latencyMs": 5 }
  ]
}
```

---

## 8. Environment Configuration

### 8.1 Environment File Loading

**Runtime (NestJS):**

```typescript
// src/main.ts
const envPath = path.resolve(process.cwd(), `.env.${process.env.NODE_ENV ?? 'development'}`);
app.useLogger(app.get(Logger));
```

**CLI Scripts:**

```typescript
// src/config/load-env-files.ts
import { loadEnvFilesForCli } from './load-env-files';
loadEnvFilesForCli(); // loads .env.{NODE_ENV} before any imports
```

**Priority:**

```
.env.{NODE_ENV}        ← highest (override all)
.env.{NODE_ENV}.local
.env
.env.local            ← lowest
```

### 8.2 Configuration Validation

**File:** `src/config/env.validation.ts`

Sử dụng `class-validator` + `class-transformer` để validate và transform env vars:

```typescript
// Ví dụ: Database config validation
@IsString() @MinLength(1)
CORE_DB_USERNAME: string;

@IsString() @MinLength(1)
CORE_DB_PASSWORD: string;

@IsString() @IsOptional()
KAFKA_BROKERS: string; // default: 'localhost:29092'

@IsEnum(['noop', 'kafka', 'redis', 'bullmq'])
EVENT_PUBLISHER_DRIVER: 'noop' | 'kafka' | 'redis' | 'bullmq';
```

### 8.3 Key Environment Variables

#### Database

| Variable | Default | Mô tả |
|----------|---------|--------|
| `CORE_DB_HOST` | `localhost` | PostgreSQL host |
| `CORE_DB_PORT` | `5432` | PostgreSQL port |
| `CORE_DB_USERNAME` | — | Database user (bắt buộc) |
| `CORE_DB_PASSWORD` | — | Database password (bắt buộc) |
| `CORE_DB_NAME` | — | Database name (bắt buộc) |
| `MARKET_TS_PORT` | `5433` | TimescaleDB port |
| `CLICKHOUSE_HTTP_PORT` | `8123` | ClickHouse HTTP |
| `DB_SSL_ENABLED` | `false` | SSL connection |

#### Kafka / Outbox

| Variable | Default | Mô tả |
|----------|---------|--------|
| `KAFKA_BROKERS` | `localhost:29092` | Broker list |
| `KAFKA_CLIENT_ID` | `crypto-trading-backend-outbox` | Client ID |
| `KAFKA_TOPIC_PREFIX` | `crypto-trading` | Topic prefix |
| `EVENT_PUBLISHER_DRIVER` | `noop` | Outbox driver |
| `EVENT_OUTBOX_MAX_ATTEMPTS` | `5` | Max retry attempts |
| `KAFKA_DLQ_TOPIC_ENABLED` | `true` | Enable DLQ |

#### Redis

| Variable | Default | Mô tả |
|----------|---------|--------|
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password (optional) |
| `REDIS_DB` | `0` | Database number |

#### Matching Engine

| Variable | Default | Mô tả |
|----------|---------|--------|
| `MATCHING_ENGINE` | `ts` | `ts` (TypeScript) hoặc `go` |
| `TICKER_SOURCE` | `binance` | Nguồn ticker |
| `PUBLIC_WS_SOURCE` | `binance` | WebSocket source |

#### Blockchain

| Variable | Default | Mô tả |
|----------|---------|--------|
| `ONCHAIN_OPERATOR_MODE` | `sandbox` | `production` hoặc `sandbox` |
| `TRON_RPC_URL` | — | Tron RPC endpoint |
| `SOLANA_RPC_URL` | — | Solana RPC endpoint |
| `ETHEREUM_RPC_URL` | — | Ethereum RPC |
| `BSC_RPC_URL` | — | BSC RPC |
| `POLYGON_RPC_URL` | — | Polygon RPC |
| `TRON_MAINNET_RPC` | — | Tron mainnet RPC |

#### Security

| Variable | Default | Mô tả |
|----------|---------|--------|
| `JWT_SECRET` | — | JWT signing secret (bắt buộc prod) |
| `JWT_EXPIRATION` | `24h` | Token expiration |
| `BCRYPT_ROUNDS` | `10` | Password hash rounds |
| `WALLET_ENCRYPTION_KEY` | — | Wallet private key encryption |

---

## 9. CI/CD Pipeline

### 9.1 Current State

**Hiện tại chưa có CI/CD pipeline được cấu hình.**

- Không có GitHub Actions workflows
- Không có GitLab CI
- Không có Jenkinsfile
- Không có Kubernetes manifests

### 9.2 Recommended CI/CD Setup

#### Development Workflow

```bash
# 1. Lint
npm run lint

# 2. Type check
npm run build

# 3. Unit tests
npm test

# 4. E2E tests
npm run test:e2e

# 5. Docker build (production image)
docker build -t crypto-trading-be:latest .
```

#### Recommended GitHub Actions Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: crypto_trading_test
        ports:
          - 5432:5432
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: be-cryptocurrency-trading-app/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: be-cryptocurrency-trading-app

      - name: Run lint
        run: npm run lint
        working-directory: be-cryptocurrency-trading-app

      - name: Run build
        run: npm run build
        working-directory: be-cryptocurrency-trading-app

      - name: Run tests
        run: npm test -- --coverage
        working-directory: be-cryptocurrency-trading-app
        env:
          NODE_ENV: test
          CORE_DB_HOST: localhost
          CORE_DB_USERNAME: test
          CORE_DB_PASSWORD: test
          CORE_DB_NAME: crypto_trading_test
          REDIS_HOST: localhost
```

#### Recommended Docker Build

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --spider -q http://localhost:3000/api/v1/health || exit 1
CMD ["node", "dist/main"]
```

---

## 10. Development Workflow

### 10.1 Khởi Động Infrastructure

```bash
# Khởi động tất cả infrastructure services
docker compose -f docker-compose.infrastructure.yml --profile '' up -d
docker compose -f docker-compose.infrastructure.yml --profile kafka up -d
docker compose -f docker-compose.infrastructure.yml --profile clickhouse up -d
docker compose -f docker-compose.infrastructure.yml --profile timescale up -d

# Hoặc đơn giản hơn (nếu có npm script)
npm run docker:infra:up
```

### 10.2 Chạy Database Migrations

```bash
# Development
npm run db:migrate

# Check migration status
npm run db:status

# Rollback
npm run db:migrate:down

# Seed data
npm run db:seed

# Reset database (migrate + seed)
npm run db:reset
```

### 10.3 Khởi Động Application

```bash
# Development (watch mode)
npm run dev

# Production
npm run build
npm start:prod

# Production với PM2
# PM2 không dùng trong production stack (dùng Docker Compose)
# docker compose -f docker-compose.prod.yml up -d app
```

### 10.4 Development Scripts

```bash
npm run lint          # Biome lint
npm run lint:fix      # Biome lint + auto-fix
npm run build         # TypeScript compile
npm test             # Unit tests
npm run test:watch    # Jest watch mode
npm run test:cov      # Coverage report
npm run test:e2e      # E2E tests
```

---

## 11. Module Imports Dependency Graph

```
AppModule
├── ConfigModule (@Global)
├── DatabaseProvidersModule (@Global)
│   ├── CORE_DB (TypeORM DataSource)
│   ├── MARKET_TS_DB (TypeORM DataSource)
│   └── ANALYTICS_DB (ClickHouse config)
├── RedisModule (@Global) ──────────────────────────────▶ Redis
├── ApplicationBusModule (@Global) ────────────────────▶ CQRS EventBus
├── UnitOfWorkModule (@Global) ───────────────────────▶ Transaction wrapper
├── BullModule ───────────────────────────────────────▶ BullMQ + Redis
├── BullBoardModule ──────────────────────────────────▶ Bull Board UI
├── TelemetryModule ──────────────────────────────────▶ Prometheus + OTel
├── HealthModule ─────────────────────────────────────▶ Health checks
├── OutboxModule ─────────────────────────────────────┐
│   ├── KafkaOutboxEventPublisher ────────────────────▶ Kafka
│   ├── OutboxRelayService ───────────────────────────▶ Redis (lock)
│   └── OutboxRelayProcessor (BullMQ) ────────────────▶ BullMQ
├── BinanceRestModule ────────────────────────────────▶ Binance API
├── AuthModule ───────────────────────────────────────▶ JWT + Passport
├── UsersModule ───────────────────────────────────────┤
├── CurrenciesModule ─────────────────────────────────┤
├── MarketsModule ────────────────────────────────────┤
├── ExchangeModule ───────────────────────────────────┤
├── ExchangeRateModule ───────────────────────────────┤
├── TradingModule ────────────────────────────────────┤
├── WalletsModule ────────────────────────────────────┤
├── OrdersModule ─────────────────────────────────────┤
├── MatchingModule ───────────────────────────────────┤
│   └── MatchingQueueService ─────────────────────────▶ BullMQ matching
├── BlockchainModule ─────────────────────────────────┤
│   └── TronProvider, EvmProvider, SolanaProvider ───▶ Blockchain RPC
├── BlockchainDepositWatcherModule ───────────────────┤
│   └── DepositWatcherProcessor ─────────────────────▶ BullMQ deposit-watcher
├── DepositsModule ────────────────────────────────────┤
├── ManagedWalletsModule ──────────────────────────────┤
├── TreasuryModule ───────────────────────────────────┤
│   └── TreasuryQueueService ────────────────────────▶ BullMQ treasury
├── TreasuryE2eConfigModule ──────────────────────────┤
├── DashboardModule ──────────────────────────────────┤
├── NotificationsModule ──────────────────────────────┤
│   └── FCMService ───────────────────────────────────▶ Firebase
├── PaymentConfigModule ──────────────────────────────┤
│   └── PaymentConfigProcessor ──────────────────────▶ BullMQ payment-config
├── MarketMakerModule ────────────────────────────────┤
├── ReconciliationModule ─────────────────────────────┤
├── SystemConfigModule ───────────────────────────────┤
└── MetadataModule ───────────────────────────────────┘
```

---

## 12. Infrastructure Checklist

### Pre-Production

- [ ] `JWT_SECRET` đặt giá trị mạnh (minimum 256-bit)
- [ ] `WALLET_ENCRYPTION_KEY` đặt giá trị mạnh, lưu trong secret manager
- [ ] PostgreSQL: bật SSL (`DB_SSL_ENABLED=true`)
- [ ] Redis: bật password (`REDIS_PASSWORD`)
- [ ] Kafka: production brokers, replication factor 3, min ISR 2
- [ ] ClickHouse: production cluster
- [ ] Environment validation không có `optional` cho các biến bắt buộc
- [ ] Health check endpoint protected khỏi public access
- [ ] Prometheus metrics endpoint protected khỏi public access
- [ ] Bull Board protected bởi ADMIN role guard
- [ ] Database: backup strategy configured
- [ ] TimescaleDB: retention và compression policies configured
- [ ] Kafka: topic retention policy configured
- [ ] Kubernetes manifests created (deployment, service, ingress, HPA)

### Monitoring Alerts

- [ ] `outbox_unpublished_rows > 100` → Alert
- [ ] `outbox_dead_letter_rows > 0` → Alert
- [ ] `market_read_model_projection_lag_seconds > 60` → Alert
- [ ] `circuit_breaker_state == 1` (OPEN) → Alert
- [ ] `reconciliation_balance_drift_total` tăng → Alert
- [ ] Health check `ok: false` → Alert
