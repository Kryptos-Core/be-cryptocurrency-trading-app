# Cấu hình môi trường - Cập nhật theo mã nguồn hiện tại

## Tổng quan

Backend sử dụng:
- `src/config/env.validation.ts` — `validateEnvironment`: chỉ các key khai báo trong class **`EnvironmentVariables`** và trong mảng **`envVarKeys`** mới đi vào object đã validate và được **`ConfigService.get()`** đọc từ `.env`. Thêm biến mới mà quên hai chỗ này → biến **không có hiệu lực** (đã gặp với `WALLETCONNECT_*` trước khi bổ sung whitelist).
- `src/config/app.config.ts` — ánh xạ sang namespace `app` (đọc `process.env` sau bước validate).

Ứng dụng sẽ thất bại khi khởi động nếu có lỗi xác thực (validation).

## Thiết lập nhanh

```bash
cp .env.example .env
```

Sau đó điền thông tin và chạy ứng dụng.

## Nhóm biến quan trọng

### Các biến cốt lõi bắt buộc (Core)

| Biến | Mô tả |
|---|---|
| DB_HOST | Host MySQL |
| DB_PORT | Port MySQL |
| DB_USERNAME | Tên người dùng MySQL |
| DB_PASSWORD | Mật khẩu MySQL |
| DB_NAME | Tên cơ sở dữ liệu |
| JWT_SECRET | Mã bí mật JWT |
| REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_DB | Kết nối Redis (cache, lock khớp lệnh, pub/sub) — xem [REDIS_USAGE.md](REDIS_USAGE.md) |

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

**Cấu hình runtime (UI):** Các biến ví dụ `WALLET_SYNC_INTERVAL`, `TRON_MAINNET_FULL_HOST`, `SOLANA_MAINNET_URL`, `ETH_MAINNET_RPC_URL`, `BSC_MAINNET_RPC_URL`, `BLOCKCHAIN_WITHDRAW_*`, `PLATFORM_CASH_CURRENCY_SYMBOL`, `BLOCKCHAIN_DEPOSIT_*_TO_USDT_RATE`, … được seed vào bảng `system_configs` khi khởi động (nếu thiếu) và có thể chỉnh qua **GET/PATCH `/api/v1/system-configs/runtime`** (JWT + `FINANCE_MANAGER`/`ADMIN` + `PAYMENT_CONFIGS_MANAGE`). Giá trị đọc thực tế: **Redis cache → MySQL → fallback `.env`**. Tab **Platform** trên màn **Payment Configuration** (Flutter) gọi các endpoint này.

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
