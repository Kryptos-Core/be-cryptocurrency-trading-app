# Mục đích của Blockchain API

Module Blockchain cung cấp tính năng liên kết ví và hỗ trợ nạp/rút tiền on-chain cho các mạng thử nghiệm (testnet).

## Các route liên kết ví (Wallet linking)

### Đăng nhập công khai qua WalletConnect (không JWT)

Nằm trong module **auth** (không phải `blockchain`):

- POST /api/v1/auth/wallet/wc/init — session + `wcUri` + `relayPairing` (desktop Sepolia + SignClient khi BE có project id)
- GET /api/v1/auth/wallet/wc/status/:sessionId — poll (`address` / `signature` khi có)
- POST /api/v1/auth/wallet/wc/verify — JWT sau khi verify chữ ký

Chi tiết: **[WALLETCONNECT.md](WALLETCONNECT.md)**.

### WalletConnect v2 — liên kết ví (đã đăng nhập, JWT)

- POST /api/v1/blockchain/wallets/wc/init — tạo session + `wcUri` (JWT)
- GET /api/v1/blockchain/wallets/wc/status/:sessionId — poll trạng thái (JWT)
- POST /api/v1/blockchain/wallets/wc/submit — gửi signature sau khi user ký (JWT)
- POST /api/v1/blockchain/wallets/wc/relay-webhook — callback relay (public; HMAC tùy chọn)

### Liên kết cổ điển (nonce + ký message)

- POST /api/v1/blockchain/wallets/request-link
- POST /api/v1/blockchain/wallets/verify-link
- GET /api/v1/blockchain/wallets
- GET /api/v1/blockchain/wallets/:linkId/balance
- DELETE /api/v1/blockchain/wallets/:linkId

## Các route chuyển khoản on-chain (On-chain transfer)

- GET /api/v1/blockchain/deposit/address
- GET /api/v1/blockchain/deposit/preview
- POST /api/v1/blockchain/deposit/submit
- POST /api/v1/blockchain/withdraw/request
- GET /api/v1/blockchain/transactions
- GET /api/v1/blockchain/transactions/:txId
- GET /api/v1/blockchain/networks

## Giám sát rút tiền (Admin / RBAC)

- GET /api/v1/blockchain/admin/withdrawals — danh sách rút (lọc, phân trang)
- GET /api/v1/blockchain/admin/withdrawals/stats — thống kê tổng quan
- GET /api/v1/blockchain/admin/withdrawals/:txId — chi tiết một giao dịch

## Các phụ thuộc cấu hình (Config dependencies)

- TRON_NILE_FULL_HOST
- TRON_SHASTA_FULL_HOST
- TRON_DEFAULT_NETWORK
- SOLANA_DEVNET_URL
- ETH_SEPOLIA_RPC_URL
- ETH_SEPOLIA_CHAIN_ID
- TRON_HOT_WALLET_PRIVATE_KEY
- ETH_HOT_WALLET_PRIVATE_KEY
- BLOCKCHAIN_ALLOW_TEST_SIGNATURE (hỗ trợ chỉ dành cho phát triển)
- WalletConnect (đăng nhập + liên kết): `WALLETCONNECT_PROJECT_ID` / `REOWN_PROJECT_ID`, `WALLETCONNECT_RELAY_URL`, `WALLETCONNECT_WEBHOOK_SECRET` — xem **[WALLETCONNECT.md](WALLETCONNECT.md)** và whitelist trong `env.validation.ts`
