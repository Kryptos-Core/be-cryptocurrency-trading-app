# Blockchain API Purpose

Blockchain module provides wallet linking and on-chain deposit/withdraw support for testnet networks.

## Wallet linking routes

- POST /api/v1/blockchain/wallets/request-link
- POST /api/v1/blockchain/wallets/verify-link
- GET /api/v1/blockchain/wallets
- GET /api/v1/blockchain/wallets/:linkId/balance
- DELETE /api/v1/blockchain/wallets/:linkId

## On-chain transfer routes

- GET /api/v1/blockchain/deposit/address
- GET /api/v1/blockchain/deposit/preview
- POST /api/v1/blockchain/deposit/submit
- POST /api/v1/blockchain/withdraw/request
- GET /api/v1/blockchain/transactions
- GET /api/v1/blockchain/transactions/:txId
- GET /api/v1/blockchain/networks

## Config dependencies

- TRON_NILE_FULL_HOST
- TRON_SHASTA_FULL_HOST
- TRON_DEFAULT_NETWORK
- SOLANA_DEVNET_URL
- ETH_SEPOLIA_RPC_URL
- ETH_SEPOLIA_CHAIN_ID
- TRON_HOT_WALLET_PRIVATE_KEY
- ETH_HOT_WALLET_PRIVATE_KEY
- BLOCKCHAIN_ALLOW_TEST_SIGNATURE (dev-only helper)
