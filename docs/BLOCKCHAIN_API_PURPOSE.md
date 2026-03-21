# Mục đích của Blockchain API

Module Blockchain cung cấp tính năng liên kết ví và hỗ trợ nạp/rút tiền on-chain cho các mạng thử nghiệm (testnet).

## Các route liên kết ví (Wallet linking)

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
