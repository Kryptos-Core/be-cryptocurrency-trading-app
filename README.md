# Kryptos Core — Backend API

API backend cho nền tảng giao dịch tiền mã hóa (**NestJS**). Base path: **`/api/v1`**.

## Tính năng (tổng quan)

- Đăng ký / đăng nhập, JWT, phân quyền theo vai trò, 2FA qua email  
- Thị trường, lệnh, khớp lệnh, ví nội bộ và đồng bộ sàn (theo cấu hình)  
- Nạp/rút (fiat qua PayOS, on-chain theo chain đã cấu hình)  
- Liên kết ví & WalletConnect  
- Kho bạc (treasury), thông báo push (Firebase), realtime WebSocket  

Kiến trúc (outbox relay, read model): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ARCHITECTURE_FULL_ROLLOUT.md`](docs/ARCHITECTURE_FULL_ROLLOUT.md). Còn lại: [`docs/`](docs/).

## Yêu cầu

- **Node.js** (khuyến nghị LTS 20+) và npm  
- **PostgreSQL 16** và **Redis 7** (có thể dùng Docker — xem bước dưới)

## Chạy local

### 1. Biến môi trường

- Mỗi môi trường một file: **`.env.development`**, **`.env.staging`**, **`.env.production`** (cùng thư mục gốc backend). Tạo từ bản mẫu tương ứng: `.env.development.example`, `.env.staging.example`, `.env.production.example`.  
- App Nest và CLI (migration, seed) chỉ đọc **`.env.${NODE_ENV}`**. Scripts npm đặt `NODE_ENV` qua `cross-env`; nếu chạy thủ công mà thiếu `NODE_ENV`, mặc định file env là **`.env.development`**.  
- Không commit file chứa secret thật.

### 2. Infrastructure (Docker Compose)

**File:** `docker-compose.infrastructure.yml`. Dùng **cùng file env** với app (`.env.development`).

#### Lệnh khởi tạo infrastructure

| Lệnh | Mô tả |
|------|--------|
| `npm run docker:infra:up` | PostgreSQL + Redis (default, không cần profile) |
| `npm run docker:infra:up:full` | Full stack: PostgreSQL + Redis + Kafka + ClickHouse + TimescaleDB |
| `npm run docker:infra:down` | Tắt toàn bộ infrastructure |
| `npm run docker:infra:logs` | Xem logs (theo dõi realtime) |
| `npm run docker:infra:health` | Kiểm tra trạng thái các container |

#### Cách chạy Docker Compose thủ công

Nếu gọi Docker trực tiếp thay vì qua npm script, Compose **không tự đọc `.env.development`**; cần thêm `--env-file`:

```bash
# Chỉ PostgreSQL + Redis
docker compose -f docker-compose.infrastructure.yml --env-file .env.development up -d

# Full stack (Kafka + ClickHouse + TimescaleDB)
docker compose -f docker-compose.infrastructure.yml --env-file .env.development \
  --profile kafka --profile clickhouse --profile timescale up -d

# Kiểm tra trạng thái
docker compose -f docker-compose.infrastructure.yml --env-file .env.development ps

# Xem logs
docker compose -f docker-compose.infrastructure.yml --env-file .env.development logs -f postgres

# Tắt
docker compose -f docker-compose.infrastructure.yml --env-file .env.development down

# Xoá toàn bộ data (bao gồm volumes)
docker compose -f docker-compose.infrastructure.yml --env-file .env.development down -v
```

#### Services và ports mặc định

| Service | Container | Host Port | Internal Port | Profile |
|---------|-----------|-----------|---------------|---------|
| PostgreSQL | `crypto_trading_postgres` | 5432 | 5432 | — |
| Redis | `crypto_trading_redis` | 6379 | 6379 | — |
| Kafka | `crypto_trading_kafka` | 9092, 29092 | 9092, 29092 | `kafka` |
| ClickHouse | `crypto_trading_clickhouse` | 8123, 9000 | 8123, 9000 | `clickhouse` |
| TimescaleDB | `crypto_trading_timescaledb` | 5433 | 5432 | `timescale` |

- Port 9092 (Kafka): dùng từ **host machine** (Node.js app).
- Port 29092 (Kafka): dùng từ **Docker network** nội bộ (nếu cần).
- ClickHouse port 8123: HTTP interface. Port 9000: TCP native interface.

#### Kafka (KRaft mode)

Kafka chạy **KRaft mode** — không cần Zookeeper. Các biến môi trường liên quan:

```env
EVENT_PUBLISHER_DRIVER=kafka    # Bat Kafka trong app
KAFKA_BROKERS=localhost:29092   # Broker endpoint
KAFKAJS_NO_PARTITIONER_WARNING=1
```

Topics được **tự động tạo** khi app kết nối (với `KAFKA_AUTO_CREATE_TOPICS_ENABLE=true`). Để tạo topics cố định trước, dùng:

```bash
npm run kafka:topics:list
```

**Topics mặc định:**

| Topic | Partitions | Mô tả |
|-------|------------|--------|
| `crypto-trading.orderplaced` | 6 | Order được đặt |
| `crypto-trading.ordercancelled` | 6 | Order bị hủy |
| `crypto-trading.tradeexecuted` | 6 | Trade được khớp |
| `crypto-trading.depositconfirmed` | 3 | Deposit on-chain confirmed |
| `crypto-trading.walletbalancechanged` | 6 | Balance ví thay đổi |
| `crypto-trading.market.ticker` | 3 | Market ticker data |

#### ClickHouse

Schema SQL được Docker auto-run **lần đầu tiên** khi volume rỗng (mount vào `/docker-entrypoint-initdb.d/`). Nếu cần apply lại schema (volume đã có data):

```bash
# Xem tables hiện tại
npm run clickhouse:tables:list

# Apply lại schema (idempotent — dùng CREATE ... IF NOT EXISTS)
npm run db:migrate:ch

# Hoặc trực tiếp
docker exec -i crypto_trading_clickhouse clickhouse-client \
  --host 127.0.0.1 --port 9000 --query "$(cat scripts/docker/clickhouse-init.sql)"
```

#### TimescaleDB

Bật qua `MARKET_TS_ENABLED=true` trong `.env.development`. TimescaleDB là PostgreSQL với TimescaleDB extension — dùng driver `postgres`, port 5433 trên host.

### 3. Cài đặt, migration, seed, chạy dev

```bash
npm install
npm run migration:run
npm run db:seed
npm run start:dev
```

`start:dev` / `dev` đặt **`NODE_ENV=development`** (qua `cross-env`). Các lệnh khác:

| Script | Ý nghĩa ngắn |
|--------|----------------|
| `npm run start` | Chạy một lần, `NODE_ENV=development` |
| `npm run start:debug` | Dev + debugger |
| `npm run dev:staging` / `start:staging` | `NODE_ENV=staging` |
| `npm run start:prod` | Production (cần `npm run build` trước) |
| `npm run migration:run` / `migration:revert` / `migration:show` | TypeORM migrations |
| `npm run db:seed` / `db:clean` | Seed / truncate toàn bộ bảng (kể cả `migrations`) |

## Sau khi `npm run db:clean`

Lệnh **truncate toàn bộ bảng** (kể cả bảng migration) — ứng dụng mất catalog cặp (`market_pairs`, v.v.) cho đến khi khôi phục schema và dữ liệu tối thiểu.

1. Chạy lại migration (bắt buộc vì bảng migration cũng bị xóa):

   ```bash
   npm run migration:run
   ```

2. (Khuyến nghị) Nạp seed tài khoản / cấu hình cơ bản:

   ```bash
   npm run db:seed
   ```

3. Khởi động API (`npm run start:dev`). Backend có bootstrap đồng bộ catalog Binance khi DB trống; nếu **vẫn không thấy cặp** (rate limit, mạng), người có quyền **`exchange:sync`** gọi đồng bộ thủ công qua API hoặc từ app (Cài đặt / màn Thị trường khi danh sách trống).

4. Tab Markets trên client chỉ hiển thị dữ liệu sau khi catalog đã có ít nhất một cặp active.

Production: `npm run build` rồi `npm run start:prod`.

## Kiểm tra nhanh

| | URL |
|---|-----|
| API | `http://127.0.0.1:3000/api/v1` |
| Health | `GET http://127.0.0.1:3000/api/v1/health` |
| Swagger | `http://127.0.0.1:3000/api/docs` (thường tắt khi `NODE_ENV=production`) |

## Scripts bổ sung

| Script | Ý nghĩa |
|--------|----------|
| `npm run docker:infra:up` / `docker:infra:down` | PostgreSQL + Redis (Compose, `--env-file .env.development`) |
| `npm run docker:infra:up:full` | Full stack (Kafka + ClickHouse + TimescaleDB) |
| `npm run kafka:topics:list` | Liệt kê Kafka topics |
| `npm run lint:boundaries` | Kiểm tra import xuyên module (theo script + allowlist) |
| `npm run test` | Jest unit + integration tests |
| `npm run test:cov` | Jest với coverage report |

Production: `npm run build` rồi `npm run start:prod`.

## Kiến trúc mã nguồn

Module `auth` và `orders` sử dụng **Clean Architecture**: `domain/` (ports) → `application/` (use-cases, queries) → `infrastructure/` (persistence adapters, providers) → presentation (`orders.controller.ts`, `auth.controller.ts`).

Các module khác (`wallets`, `users`, `markets`, `currencies`, `deposits`, `blockchain`, `treasury`, `matching`, …) dùng **hybrid** với `BaseRepository`; một số module đang có thêm lớp **`application/queries`** cho API đọc mỏng.

**Toàn cục:** transactional **outbox** (`integration_outbox`) + relay **Bull**, **`UnitOfWork`**, **`@nestjs/cqrs`** (application bus), read model pilot **`read_market_pairs`** và biến **`READ_MARKETS_FROM_PROJECTION`**. Ranh giới module: `npm run lint:boundaries`.

Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_ACCESS_PATTERNS.md](docs/DATA_ACCESS_PATTERNS.md).

Seed dùng `src/seed/data/users.json` nếu có; không thì dùng `users.json.example` (copy thành `users.json` và đổi mật khẩu ngoài môi trường dev). Có thể trỏ `SEED_USERS_JSON` sang file khác.

| Email (mẫu) | Mật khẩu (mẫu) | Vai trò |
|-------------|----------------|---------|
| admin@example.com | ChangeMeAdmin! | ADMIN |
| trader1@example.com | ChangeMeTrader! | TRADER |
| trader2@example.com | ChangeMeTrader! | TRADER |
| risk@example.com | ChangeMeRisk! | RISK_OFFICER |
| support@example.com | ChangeMeSupport! | SUPPORT_AGENT |
| maker@example.com | ChangeMeMaker! | MARKET_MAKER |
| finance@example.com | ChangeMeFinance! | FINANCE_MANAGER |
