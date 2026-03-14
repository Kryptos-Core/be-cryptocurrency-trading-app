# Environment Configuration - Cap Nhat Theo Code Hien Tai

## Tong quan

Backend su dung:
- src/config/env.validation.ts de validate bien moi truong
- src/config/app.config.ts de map env sang app config

App se fail startup neu validation loi.

## Setup nhanh

```bash
cp env.example .env
```

Sau do dien thong tin va chay app.

## Nhom bien quan trong

### Core bat buoc

| Variable | Mo ta |
|---|---|
| DB_HOST | Host MySQL |
| DB_PORT | Port MySQL |
| DB_USERNAME | User MySQL |
| DB_PASSWORD | Password MySQL |
| DB_NAME | Ten DB |
| JWT_SECRET | JWT secret |

### Trading va exchange

| Variable | Gia tri thong dung |
|---|---|
| TRADING_ENVIRONMENT | testnet hoac mainnet |
| EXCHANGE_MODE | binance hoac mock |
| BINANCE_TESTNET_ENABLED | true/false |
| BINANCE_TESTNET_API_KEY | API key testnet |
| BINANCE_TESTNET_API_SECRET | API secret testnet |
| BINANCE_TESTNET_BASE_URL | Spot testnet: https://testnet.binance.vision |
| BINANCE_MAINNET_API_KEY | API key mainnet |
| BINANCE_MAINNET_API_SECRET | API secret mainnet |
| BINANCE_MAINNET_BASE_URL | https://fapi.binance.com |

### Wallet sync

| Variable | Mo ta |
|---|---|
| WALLET_SYNC_INTERVAL | Chu ky sync wallet (ms) |
| WALLET_RECONCILIATION_THRESHOLD | Nguong lech cho reconcile |

### Blockchain testnet

| Variable | Mo ta |
|---|---|
| TRON_NILE_FULL_HOST | RPC TRON Nile |
| TRON_SHASTA_FULL_HOST | RPC TRON Shasta |
| TRON_DEFAULT_NETWORK | TRON_NILE hoac TRON_SHASTA |
| SOLANA_DEVNET_URL | RPC Solana devnet |
| ETH_SEPOLIA_RPC_URL | RPC Sepolia |
| ETH_SEPOLIA_CHAIN_ID | Chain id Sepolia |
| ETH_HOT_WALLET_PRIVATE_KEY | Private key hot wallet Ethereum |
| TRON_HOT_WALLET_PRIVATE_KEY | Private key hot wallet Tron |
| BLOCKCHAIN_ALLOW_TEST_SIGNATURE | Chi dung dev, mac dinh false |

### PayOS

| Variable | Mo ta |
|---|---|
| PAYOS_CLIENT_ID | Merchant client id |
| PAYOS_API_KEY | API key |
| PAYOS_CHECKSUM_KEY | Key verify signature/webhook |
| PAYOS_RETURN_URL | URL redirect khi thanh toan xong |
| PAYOS_CANCEL_URL | URL redirect khi huy thanh toan |

## Quy tac production cho PayOS

Khi NODE_ENV=production, backend bat buoc co day du 5 bien PayOS:
- PAYOS_CLIENT_ID
- PAYOS_API_KEY
- PAYOS_CHECKSUM_KEY
- PAYOS_RETURN_URL
- PAYOS_CANCEL_URL

Neu thieu, app fail startup ngay.

## Luu y thuc te

- Khong commit file .env that.
- Neu doi env, phai restart backend.
- Trong logs, uu tien kiem tra thong bao Environment validation failed neu app khong len.
