# Cấu hình môi trường - Cập nhật theo mã nguồn hiện tại

> Last reviewed: 2026-07-28 — verified against `.env.development.example` (CORE_DB_*, MARKET_READ_SOURCE, EVENT_OUTBOX_*, WALLET/SEED/BINANCE_CREDENTIALS_ENCRYPTION_KEY, SMTP, Firebase).

## Tổng quan

Backend sử dụng:
- `src/config/env.validation.ts` — `validateEnvironment`: chỉ các key khai báo trong class **`EnvironmentVariables`** và trong mảng **`envVarKeys`** mới đi vào object đã validate và được **`ConfigService.get()`** đọc từ file env (`.env.development` / `.env.staging` / `.env.production` theo `NODE_ENV`). Thêm biến mới mà quên hai chỗ này → biến **không có hiệu lực** (đã gặp với `WALLETCONNECT_*` trước khi bổ sung whitelist).
- `src/config/app.config.ts` — ánh xạ sang namespace `app` (đọc `process.env` sau bước validate).

Ứng dụng sẽ thất bại khi khởi động nếu có lỗi xác thực (validation).

## Thiết lập nhanh

```bash
cp .env.development.example .env.development
# staging / production: dùng .env.staging.example / .env.production.example
```

Sau đó điền thông tin và chạy ứng dụng (đảm bảo `NODE_ENV` khớp file, hoặc dùng script npm đã set sẵn).

## Nhóm biến quan trọng

### Database nguồn (Postgres, Redis, TimescaleDB)

| Biến | Mô tả |
|---|---|
| `CORE_DB_SOURCE` | Source alias (luôn `postgres` cho runtime hiện tại). |
| `CORE_DB_TYPE` | `postgres` (TypeORM driver). |
| `CORE_DB_HOST` / `CORE_DB_PORT` / `CORE_DB_USERNAME` / `CORE_DB_PASSWORD` / `CORE_DB_NAME` | PostgreSQL connection — **nguồn dữ liệu chính** (source of truth) cho orders, wallets, on-chain deposits, treasury, users. |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | Alias legacy — fallback cho PostgreSQL nếu `CORE_DB_*` chưa khai báo. |
| `MARKET_READ_SOURCE` | `postgres` (mặc định) \| `redis` \| `timescale` — chọn nguồn cho market read path. |
| `MARKET_TS_HOST` / `MARKET_TS_PORT` / `MARKET_TS_USERNAME` / `MARKET_TS_PASSWORD` / `MARKET_TS_DB` | TimescaleDB (Market read store, port 5433 theo `.env.development.example`). |
| `JWT_SECRET` / `JWT_EXPIRATION` | JWT signing key + TTL (mặc định `24h`). |

### Event outbox & Kafka (publisher driver)

| Biến | Mô tả |
|---|---|
| `EVENT_OUTBOX_ENABLED` | `true` / `false` — bật transaction outbox. |
| `EVENT_SCHEMA_FORMAT` | `json` (mặc định). |
| `EVENT_PUBLISHER_DRIVER` | `noop` (dev mặc định) \| `kafka` \| `redis` \| `bullmq`. |
| `EVENT_OUTBOX_MAX_ATTEMPTS` | Số lần retry tối đa (mặc định `5`). |
| `EVENT_OUTBOX_RETRY_BASE_MS` | Backoff cơ sở (mặc định `1000`). |
| `KAFKAJS_NO_PARTITIONER_WARNING` | Tắt warning kafkajs (tùy chọn). |
| `KAFKA_BROKERS` | Danh sách broker, ví dụ `localhost:29092` (dev) hoặc `kafka:9092` (production compose). |
| `KAFKA_CLIENT_ID` | Client id cho outbox publisher. |
| `KAFKA_TOPIC_PREFIX` | Tiền tố topic (mặc định `crypto-trading`). |
| `KAFKA_CLUSTER_ID` | Cluster id — generate một lần. |
| `KAFKA_DLQ_TOPIC_ENABLED` | Bật dead-letter topic. |
| `KAFKA_CONSUMERS_ENABLED` | Bật consumer groups. |
| `KAFKA_CONSUMER_GROUP_PREFIX` | Tiền tố group, ví dụ `crypto-trading`. |

### Redis (cache, lock, pub/sub)

| Biến | Mô tả |
|---|---|
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Kết nối Redis — cache, lock khớp lệnh, pub/sub, lock relay outbox. Xem [REDIS_USAGE.md](REDIS_USAGE.md). |

### Read model / CQRS (feature flags)

| Biến | Mô tả |
|---|---|
| `READ_MARKETS_FROM_PROJECTION` | (Tùy chọn) `true` / `1` / `yes`: một số API list cặp đọc từ **`read_market_pairs`** khi filter đơn giản (`GetMarketPairQuery`). Mặc định tắt. Bật sau khi migration + relay đã đồng bộ — [ARCHITECTURE.md](ARCHITECTURE.md). |
| `READ_MODEL_ONCHAIN_DEPOSITS` | (Tùy chọn) `true` / `1` / `yes`: listing on-chain deposit user đọc **`read_onchain_deposits`** (merge với non-deposit từ `onchain_transactions`). Mặc định tắt. Bật sau migration `read_onchain_deposits` + relay — [ARCHITECTURE_FULL_ROLLOUT.md](ARCHITECTURE_FULL_ROLLOUT.md). |

### Matching engine (TS / Go) + Ticker / Public WS

| Biến | Mô tả |
|---|---|
| `MATCHING_ENGINE` | `ts` (mặc định, production-ready) \| `go` (shadow matching, Phase 6-8). |
| `TICKER_SOURCE` | `nestjs` (mặc định) \| `redis` \| `go_aggregator`. |
| `PUBLIC_WS_SOURCE` | `nestjs` (mặc định) \| `redis` \| `go`. |
| `MATCHING_GO_CANARY_PAIRS` | Danh sách cặp canary Go matching (CSV). |
| `GO_AGGREGATOR_TICKER_CHANNEL` | Redis channel cho ticker từ Go (mặc định `trading:external:ticker`). |
| `GO_AGGREGATOR_OHLC_CHANNEL` | Redis channel cho OHLC từ Go (mặc định `trading:external:ohlc`). |
| `MATCHING_SHADOW_MONITOR_PAIRS` | Cặp theo dõi shadow parity. |
| `MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT` | Ngưỡng match rate (mặc định `99.9`). |
| `MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS` | Ngưỡng unmatched runs (mặc định `0`). |
| `GO_ROLLOUT_WINDOW_HOURS` / `GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS` / `GO_ROLLOUT_MIN_PUBLIC_WS_COMPARED_PAIRS` / `GO_ROLLOUT_ROLLBACK_DRILL_MAX_AGE_HOURS` | Ngưỡng Go rollout. |
| `MARKET_AGGREGATOR_SHADOW_MODE` / `MARKET_AGGREGATOR_READ_ONLY_MODE` | Shadow + read-only flag cho Go market-aggregator. |
| `MATCHING_ENGINE_SHADOW_MODE` / `MATCHING_ENGINE_MUTATIONS_ENABLED` | **Mặc định tắt `MUTATIONS_ENABLED`**; bật chỉ sau parity sign-off. |
| `PUBLIC_WS_GATEWAY_SHADOW_MODE` / `PUBLIC_WS_GATEWAY_CANARY_PERCENT` | Shadow + canary traffic % cho Go public WS gateway. |

> Toàn bộ matching config có thể chỉnh qua **`/api/v1/system-configs/runtime`** (DB → Redis cache → `.env` fallback) — Tab **Platform** trên màn Payment Configuration.

### Encryption keys

| Biến | Mô tả |
|---|---|
| `WALLET_ENCRYPTION_KEY` | 32 bytes hex (64 ký tự) — AES-256-GCM cho treasury / payment-config payloads. |
| `SEED_DATA_ENCRYPTION_KEY` | 32 bytes hex — giải mã `users.json.enc` (xem `src/seed/README.md`). Generate: `openssl rand -hex 32`. |
| `BINANCE_CREDENTIALS_ENCRYPTION_KEY` | 32 bytes hex — AES-256 cho per-user Binance API keys (lưu ở `user-binance-credentials`/FE `binance_trading`). |

### Email & Push

| Biến | Mô tả |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP relay cho email (verification, security change requests, …). Mặc định `smtp.gmail.com:587`. |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Đường dẫn tới Firebase Admin SDK service account JSON. Trong compose production nên đặt ngoài repo. |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` / `CLOUDINARY_AVATAR_FOLDER` | Cloudinary cho avatar upload (`features.users.me.avatar`). Xem [PROFILE_AVATAR_SECURITY_REVIEW.md](PROFILE_AVATAR_SECURITY_REVIEW.md). |

### Application-level safety flags (production)

| Biến | Mô tả |
|---|---|
| `LOG_ENABLED` / `LOG_LEVEL` / `LOG_FORMAT` | Toggle + level + format (`json`/`pretty`). |
| `RATE_LIMIT_TTL` / `RATE_LIMIT_MAX` | Rate limit theo IP/user. |
| `BCRYPT_ROUNDS` | Cost factor cho bcrypt hash. |
| `BLOCKCHAIN_ALLOW_TEST_SIGNATURE` / `ALLOW_UI_TEST_SIGNATURE` | **Rủi ro cao** — chỉ bật trên staging/dev. |
| `MATCHING_BOOK_FULL_REFRESH` | Refresh full order book khi khởi động. |
| `GF_SECURITY_ADMIN_PASSWORD` | Mật khẩu admin Grafana. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Telegram alert forwarding (Alertmanager bridge). |

### Network / public API

| Biến | Mô tả |
|---|---|
| `APP_HOST` / `BIND_HOST` / `APP_PORT` / `APP_HOSTNAME` / `APP_PUBLIC_URL` | Listen address (mặc định `0.0.0.0:3000`); hostname + public URL cho CORS/healthcheck. |
| `KAFKA_EXTERNAL_BIND_HOST` / `KAFKA_EXTERNAL_PORT` | Listener public cho Kafka external (mặc định `0.0.0.0:29092`). |
| `CORS_ORIGIN` / `CORS_CREDENTIALS` | CORS config cho FE app domain. |
| `APP_ENV_FILE` | Tên file env mà Docker compose override (vd `.env.staging`). |

### ClickHouse / analytics

| Biến | Mô tả |
|---|---|
| `CLICKHOUSE_DB` / `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` / `CLICKHOUSE_PORT` / `CLICKHOUSE_TCP_PORT` | ClickHouse (audit/analytics). |

### Giao dịch và Sàn giao dịch (Trading và Exchange)

| Biến | Giá trị thông dụng |
|---|---|
| TRADING_ENVIRONMENT | `testnet` hoặc `mainnet` |
| EXCHANGE_MODE | `binance` hoặc `mock` |
| MOCK_EXCHANGE_BALANCE | (chỉ khi `EXCHANGE_MODE=mock`) Chuỗi Decimal — số dư mock trả về `getBalance` (mặc định `10000`) |
| MOCK_EXCHANGE_ORDER_STATUS_PRICE | (chỉ khi mock) Giá mock trong `getOrderStatus` (mặc định `50000`) |
| SEED_USERS_JSON | (tùy chọn, script seed) Đường dẫn file JSON users; nếu không set, dùng `src/seed/data/users.json` hoặc `users.json.example` |
| BINANCE_TESTNET_ENABLED | `true`/`false` |
| BINANCE_TESTNET_API_KEY | API key bản thử nghiệm |
| BINANCE_TESTNET_API_SECRET | API secret bản thử nghiệm |
| BINANCE_TESTNET_BASE_URL | Spot testnet: https://testnet.binance.vision |
| BINANCE_MAINNET_API_KEY | API key bản chính thức |
| BINANCE_MAINNET_API_SECRET | API secret bản chính thức |
| BINANCE_MAINNET_BASE_URL | https://fapi.binance.com |

### Đồng bộ hóa ví (Wallet sync)

| Biến | Mô tả |
|---|---|
| WALLET_SYNC_INTERVAL | Chu kỳ đồng bộ ví (ms) |
| WALLET_RECONCILIATION_THRESHOLD | Ngưỡng lệch cho việc đối soát (reconcile) |

### Blockchain (on-chain)

| Biến | Mô tả |
|---|---|
| ONCHAIN_OPERATOR_MODE | `production` (mặc định) hoặc `sandbox` — quyết định resolver họ mạng → mainnet vs testnet; khi `sandbox` thì validation bắt buộc đủ RPC sandbox (xem dưới). **Không** thay cho “PayOS sandbox” (hai khái niệm độc lập). |
| TRON_MAINNET_FULL_HOST | RPC Tron mainnet (ví dụ TronGrid) |
| SOLANA_MAINNET_URL | RPC Solana mainnet-beta |
| ETH_MAINNET_RPC_URL | RPC Ethereum mainnet |
| ETH_MAINNET_CHAIN_ID | Chuỗi Ethereum mainnet (thường `1`) |
| BSC_MAINNET_RPC_URL | RPC BNB Smart Chain mainnet |
| BSC_MAINNET_CHAIN_ID | Chuỗi BSC (thường `56`) |
| TRON_NILE_FULL_HOST | RPC Tron Nile (bắt buộc URL hợp lệ khi `ONCHAIN_OPERATOR_MODE=sandbox`) |
| TRON_SHASTA_FULL_HOST | RPC Tron Shasta (tùy chọn) |
| SOLANA_DEVNET_URL | RPC Solana devnet (bắt buộc khi `ONCHAIN_OPERATOR_MODE=sandbox`) |
| ETH_SEPOLIA_RPC_URL / ETH_SEPOLIA_CHAIN_ID | Sepolia (bắt buộc URL khi sandbox; chain id thường `11155111`) |
| BSC_CHAPEL_RPC_URL / BSC_CHAPEL_CHAIN_ID | BSC testnet Chapel (bắt buộc URL khi sandbox; chain id thường `97`) |
| ETH_HOT_WALLET_PRIVATE_KEY | Khóa bí mật ví nóng EVM (nếu dùng) |
| TRON_HOT_WALLET_PRIVATE_KEY | Khóa bí mật ví nóng Tron |
| BLOCKCHAIN_ALLOW_TEST_SIGNATURE | Chỉ dùng cho phát triển, mặc định là false |
| ALLOW_UI_TEST_SIGNATURE | `true` trên production để cho phép sửa `BLOCKCHAIN_ALLOW_TEST_SIGNATURE` qua API/UI (rất rủi ro) |
| `WALLETCONNECT_PROJECT_ID`, `REOWN_PROJECT_ID`, `WALLETCONNECT_RELAY_URL`, `WALLETCONNECT_WEBHOOK_SECRET` | WalletConnect / Reown — desktop SignClient + liên kết ví; bảng đầy đủ và luồng: **[WALLETCONNECT.md](WALLETCONNECT.md)** |

**Cấu hình runtime (UI):** Các biến ví dụ `WALLET_SYNC_INTERVAL`, `TRON_MAINNET_FULL_HOST`, `SOLANA_MAINNET_URL`, `ETH_MAINNET_RPC_URL`, `BSC_MAINNET_RPC_URL`, `BLOCKCHAIN_WITHDRAW_*`, `PLATFORM_CASH_CURRENCY_SYMBOL`, `BLOCKCHAIN_DEPOSIT_*_TO_USDT_RATE`, … được seed vào bảng `system_configs` khi khởi động (nếu thiếu) và có thể chỉnh qua **GET/PATCH `/api/v1/system-configs/runtime`** (JWT + `FINANCE_MANAGER`/`ADMIN` + `PAYMENT_CONFIGS_MANAGE`). Giá trị đọc thực tế: **Redis cache → PostgreSQL (`system_configs`) → fallback `.env`**. Tab **Platform** trên màn **Payment Configuration** (Flutter) gọi các endpoint này.

### PayOS

Nguồn cấu hình **ưu tiên**: bản ghi **active** trong DB (`payment_method_configs`, loại `PAYOS`, network `MAINNET`) qua UI Payment Configuration. **`PAYOS_*` trong `.env` là fallback** khi chưa có cấu hình PayOS active trong DB (xem `DepositsService.resolvePayOSConfig`).

**Khi nào cần điền `.env` PayOS:** triển khai mới chưa seed DB, môi trường dev/staging không dùng UI Payment Configuration, hoặc cố ý muốn một bộ credential mặc định trước khi bật bản ghi DB. Khi đã có PayOS active trong DB, `.env` không bắt buộc cho luồng nạp (trừ khi code đọc thêm key khác).

**PayOS sandbox vs production** là tài khoản / dashboard merchant PayOS (API key khác nhau). **`ONCHAIN_OPERATOR_MODE`** chỉ điều khiển stack on-chain (mainnet vs Nile/Sepolia/Chapel/devnet) — hai trục này độc lập; có thể vừa PayOS production vừa on-chain sandbox trên một instance (không khuyến nghị cho tiền thật nếu không kiểm soát UI/badge).

| Biến | Mô tả |
|---|---|
| PAYOS_CLIENT_ID | ID khách hàng của Merchant |
| PAYOS_API_KEY | API key |
| PAYOS_CHECKSUM_KEY | Khóa xác thực chữ ký/webhook |
| PAYOS_RETURN_URL | URL chuyển hướng khi thanh toán xong |
| PAYOS_CANCEL_URL | URL chuyển hướng khi hủy thanh toán |
| PAYOS_DEPOSIT_CURRENCY_SYMBOL | Symbol ví được cộng sau khi thanh toán được xác nhận (ví dụ `USDT`) |
| PAYOS_FIAT_SYMBOL | Đơn vị fiat mà số tiền PayOS thể hiện (ví dụ `VND`) |
| PAYOS_FIAT_TO_QUOTE_RATE | Tỷ giá: 1 đơn vị fiat → bao nhiêu đơn vị quote (ví dụ USDT) |
| PAYOS_FX_SPREAD_BPS | Spread chuyển đổi (basis points; 100 bps = 1 %) |

## Production và PayOS

`NODE_ENV=production` **không** còn bắt buộc đủ toàn bộ biến `PAYOS_*` lúc khởi động. Trước khi bật nạp PayOS trên production, vận hành cần đảm bảo **ít nhất một** nguồn (DB hoặc `.env`); nếu thiếu cả hai, lỗi sẽ phát sinh khi xử lý nạp (message rõ từ `resolvePayOSConfig`).

## Lưu ý thực tế

- Không lưu (commit) file `.env` thực tế lên kho mã nguồn.
- Nếu thay đổi biến môi trường, phải khởi động lại backend (trừ các key runtime đã lưu trong `system_configs` / chỉnh qua UI — chúng áp dụng sau khi cache Redis hết hạn hoặc sau PATCH).
- Trong nhật ký (logs), hãy ưu tiên kiểm tra thông báo "Environment validation failed" nếu ứng dụng không khởi động được.
- Thêm biến mới cho **`ConfigService`** (hoặc cho code đọc qua cùng cơ chế validate): cập nhật **`env.validation.ts`** (`EnvironmentVariables` + `envVarKeys`), không chỉ `env.example`.
