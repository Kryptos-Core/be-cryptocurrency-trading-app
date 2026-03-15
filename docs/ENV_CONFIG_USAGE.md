# Cấu hình môi trường - Cập nhật theo mã nguồn hiện tại

## Tổng quan

Backend sử dụng:
- `src/config/env.validation.ts` để xác thực các biến môi trường.
- `src/config/app.config.ts` để ánh xạ biến môi trường sang cấu hình ứng dụng.

Ứng dụng sẽ thất bại khi khởi động nếu có lỗi xác thực (validation).

## Thiết lập nhanh

```bash
cp env.example .env
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

### Giao dịch và Sàn giao dịch (Trading và Exchange)

| Biến | Giá trị thông dụng |
|---|---|
| TRADING_ENVIRONMENT | `testnet` hoặc `mainnet` |
| EXCHANGE_MODE | `binance` hoặc `mock` |
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

### Blockchain testnet

| Biến | Mô tả |
|---|---|
| TRON_NILE_FULL_HOST | RPC TRON Nile |
| TRON_SHASTA_FULL_HOST | RPC TRON Shasta |
| TRON_DEFAULT_NETWORK | `TRON_NILE` hoặc `TRON_SHASTA` |
| SOLANA_DEVNET_URL | RPC Solana devnet |
| ETH_SEPOLIA_RPC_URL | RPC Sepolia |
| ETH_SEPOLIA_CHAIN_ID | ID chuỗi Sepolia |
| ETH_HOT_WALLET_PRIVATE_KEY | Khóa bí mật ví nóng Ethereum |
| TRON_HOT_WALLET_PRIVATE_KEY | Khóa bí mật ví nóng Tron |
| BLOCKCHAIN_ALLOW_TEST_SIGNATURE | Chỉ dùng cho phát triển, mặc định là false |

### PayOS

| Biến | Mô tả |
|---|---|
| PAYOS_CLIENT_ID | ID khách hàng của Merchant |
| PAYOS_API_KEY | API key |
| PAYOS_CHECKSUM_KEY | Khóa xác thực chữ ký/webhook |
| PAYOS_RETURN_URL | URL chuyển hướng khi thanh toán xong |
| PAYOS_CANCEL_URL | URL chuyển hướng khi hủy thanh toán |

## Quy tắc cho môi trường Production với PayOS

Khi `NODE_ENV=production`, backend bắt buộc phải có đầy đủ 5 biến PayOS:
- PAYOS_CLIENT_ID
- PAYOS_API_KEY
- PAYOS_CHECKSUM_KEY
- PAYOS_RETURN_URL
- PAYOS_CANCEL_URL

Nếu thiếu, ứng dụng sẽ dừng khởi động ngay lập tức.

## Lưu ý thực tế

- Không lưu (commit) file `.env` thực tế lên kho mã nguồn.
- Nếu thay đổi biến môi trường, phải khởi động lại backend.
- Trong nhật ký (logs), hãy ưu tiên kiểm tra thông báo "Environment validation failed" nếu ứng dụng không khởi động được.
