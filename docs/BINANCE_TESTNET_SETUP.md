# Setup Binance Testnet - Hướng Dẫn Chi Tiết

## 1. Đăng Ký Tài Khoản Binance Testnet

### Bước 1: Truy Cập Testnet
1. Mở trình duyệt
2. Truy cập: https://testnet.binance.vision/
3. Click "Connect Wallet" hoặc "Tạo Tài Khoản"

### Bước 2: Tạo API Key

**Trên Binance Testnet Dashboard:**
1. Nhấp vào icon tài khoản (góc phải trên)
2. Chọn "API Management"
3. Tạo API Key mới:
   - **Label**: `Crypto-Trading-App-Dev` (hoặc tên gì đó nhớ)
   - **Restrictions**:
     - [x] Enable Reading
     - [x] Enable Spot & Margin Trading
     - [ ] Enable Futures Trading (NẾU dùng Futures API)
     - Restrict to IP: `127.0.0.1` (local) hoặc để trống (all IPs)

4. Copy thông tin:
   - **API Key** (public key)
   - **Secret Key** (secret key) - KHÔNG share bao giờ
   - **API Passphrase** (nếu có)

### Bước 3: Lưu Credentials An Toàn

Tạo file `.env.local` (không commit lên git):

```bash
# Binance Testnet Credentials
BINANCE_TESTNET_ENABLED=true
BINANCE_TESTNET_API_KEY=your_testnet_api_key_here
BINANCE_TESTNET_API_SECRET=your_testnet_api_secret_here
BINANCE_TESTNET_BASE_URL=https://testnet.binancefutures.com
```

Hoặc .env:
```bash
# Production will use .env.production
BINANCE_TESTNET_API_KEY=vmPvauKv6MHNst5jJDFhVzVgSomeRealKeyHere
BINANCE_TESTNET_API_SECRET=wM3KL8Zx9nBvCqRsT4uVwXyZAbCdEfGhIjKlMnOpQr
```

---

## 2. Deposit USDT (Test Money)

### Bước 1: Lấy Deposit Address

**Trên Binance Testnet:**
1. Nhấp "Wallet" → "Deposit"
2. Chọn coin: **USDT** (hoặc coin khác)
3. Chọn network: **Ethereum Sepolia** hoặc **Polygon Mumbai** (testnet network)
4. Copy Deposit Address (ví dụ: `0x123abc...`)

### Bước 2: Lấy Test USDT từ Faucet

**Nếu chọn Ethereum Sepolia:**
1. Truy cập: https://faucet.sepolia.dev/
2. Paste address của bạn
3. Nhận Sepolia ETH
4. Swap ETH → USDT trên test dApp (như Uniswap Sepolia)

**Nếu chọn Polygon Mumbai:**
1. Truy cập: https://faucet.polygon.technology/
2. Chọn "Mumbai"
3. Paste address của bạn
4. Nhận MATIC
5. Tìm USDT contract trên Mumbai
6. Mint hoặc swap MATIC → USDT

### Bước 3: Xác Nhận Deposit

Sau ~10-30 phút:
- USDT sẽ xuất hiện trong Binance Testnet wallet
- Kiểm tra: Wallet → Spot Wallet
- Sẽ thấy USDT balance

---

## 3. Cấu Hình Environment

### Tệp `.env` Mẫu Hoàn Chỉnh

```bash
# Application
NODE_ENV=testnet
PORT=3000
APP_NAME=Crypto Trading API Testnet

# Trading Configuration
TRADING_ENVIRONMENT=testnet
EXCHANGE_MODE=binance

# Binance Testnet Configuration
BINANCE_TESTNET_ENABLED=true
BINANCE_TESTNET_API_KEY=your_api_key_here
BINANCE_TESTNET_API_SECRET=your_api_secret_here
BINANCE_TESTNET_BASE_URL=https://testnet.binancefutures.com

# Binance Mainnet Configuration (disable for testnet)
BINANCE_MAINNET_API_KEY=
BINANCE_MAINNET_API_SECRET=
BINANCE_MAINNET_BASE_URL=https://fapi.binance.com

# Database (Using separate testnet DB)
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_NAME=crypto_trading_testnet

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# JWT
JWT_SECRET=your_jwt_secret_key_here_at_least_32_chars_long
JWT_EXPIRATION=24h
JWT_REFRESH_SECRET=your_refresh_secret_key_here
JWT_REFRESH_EXPIRATION=7d

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:8080

# Wallet Sync Configuration
WALLET_SYNC_INTERVAL=30000
WALLET_RECONCILIATION_THRESHOLD=0.00000001

# Logging
LOGGING_ENABLED=true
LOGGING_LEVEL=debug
```

### Tệp `.env.production` (Cho Mainnet)

```bash
# Application
NODE_ENV=production
PORT=3000
APP_NAME=Crypto Trading API

# Trading Configuration
TRADING_ENVIRONMENT=mainnet
EXCHANGE_MODE=binance

# Binance Mainnet Configuration
BINANCE_MAINNET_ENABLED=true
BINANCE_MAINNET_API_KEY=your_real_mainnet_api_key
BINANCE_MAINNET_API_SECRET=your_real_mainnet_api_secret
BINANCE_MAINNET_BASE_URL=https://fapi.binance.com

# Database (Production DB)
DB_HOST=prod.database.host
DB_PORT=3306
DB_USERNAME=prod_user
DB_PASSWORD=prod_password
DB_NAME=crypto_trading_production

# ... other configs
```

---

## 4. Khởi Động Backend với Testnet

### Bước 1: Cài Dependencies
```bash
npm install
```

### Bước 2: Run Migrations
```bash
npm run migration:run
```

### Bước 3: Start Server
```bash
npm run start:dev
```

### Kiểm Tra Output:
```
[NestFactory] Starting Nest application...
[AppModule] Initializing with environment: testnet
[ExchangeModule] Binance Testnet Service initialized
[WalletsModule] Wallet service ready
[Swagger] API Documentation available at /api
```

---

## 5. Kiểm Tra Kết Nối

### Endpoint: Health Check
```bash
curl http://localhost:3000/health
```

### Endpoint: Trading Environment Info
```bash
curl http://localhost:3000/config/info
```

**Response:**
```json
{
  "environment": "testnet",
  "exchangeMode": "binance",
  "binanceUrl": "https://testnet.binancefutures.com",
  "walletSyncEnabled": true,
  "syncInterval": 30000
}
```

---

## 6. Testing Wallets API

### Setup: Đăng Nhập & Lấy Token JWT

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 1, "email": "user@example.com" }
}
```

### Test 1: Get Wallet Balance

```bash
curl http://localhost:3000/wallets/balance?currencyId=1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response:**
```json
{
  "userId": 1,
  "currencyId": 1,
  "available": "100.50",
  "frozen": "0.00",
  "total": "100.50"
}
```

### Test 2: Sync Balance từ Binance

```bash
curl -X POST http://localhost:3000/wallets/sync?currencyId=1 \
  -H "Authorization: Bearer <TOKEN>"
```

**Response:**
```json
{
  "userId": 1,
  "currencyId": 1,
  "available": "100.50",
  "frozen": "0.00",
  "total": "100.50",
  "syncedAt": "2024-02-03T10:30:45.123Z",
  "discrepancy": "0"
}
```

### Test 3: Check Reconciliation Status

```bash
curl http://localhost:3000/wallets/reconciliation-status \
  -H "Authorization: Bearer <TOKEN>"
```

**Response:**
```json
[
  {
    "currencyId": 1,
    "localBalance": "100.50",
    "externalBalance": "100.50",
    "discrepancy": "0",
    "isReconciled": true,
    "lastSyncTime": "2024-02-03T10:30:45.123Z"
  }
]
```

### Test 4: Process Deposit (Mô Phỏng)

```bash
curl -X POST http://localhost:3000/wallets/process-deposit \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "currencyId": 1,
    "externalTxId": "0x123abc456def789...",
    "amount": "50.00"
  }'
```

**Response:**
```json
{
  "userId": 1,
  "currencyId": 1,
  "available": "150.50",
  "frozen": "0.00",
  "total": "150.50",
  "transaction": {
    "txId": "0x123abc456def789...",
    "type": "EXTERNAL_DEPOSIT",
    "status": "completed",
    "timestamp": "2024-02-03T10:30:45.123Z"
  }
}
```

### Test 5: Create Withdrawal

```bash
curl -X POST http://localhost:3000/wallets/create-withdrawal \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "currencyId": 1,
    "amount": "25.00",
    "destinationAddress": "0xABCDEF1234567890..."
  }'
```

**Response:**
```json
{
  "withdrawalId": "wd_123456789",
  "userId": 1,
  "currencyId": 1,
  "amount": "25.00",
  "destinationAddress": "0xABCDEF1234567890...",
  "status": "pending",
  "createdAt": "2024-02-03T10:30:45.123Z"
}
```

---

## 7. Monitoring & Debugging

### Xem Real-time Logs

**Terminal 1: Start server với debug mode**
```bash
DEBUG=* npm run start:dev
```

**Terminal 2: Monitor balance sync**
```bash
# Tạo script: ./scripts/monitor-sync.sh
watch -n 5 'curl -s http://localhost:3000/wallets/balance?currencyId=1 \
  -H "Authorization: Bearer <TOKEN>" | jq'
```

### Check Database

**View wallet_ledger entries:**
```sql
SELECT * FROM wallet_ledger 
WHERE user_id = 1 
ORDER BY created_at DESC 
LIMIT 10;
```

**View sync events:**
```sql
SELECT * FROM wallet_sync_events 
WHERE user_id = 1 
ORDER BY sync_timestamp DESC 
LIMIT 10;
```

### View Redis Cache

```bash
redis-cli
> GET wallet:balance:1
> GET exchange:rate:USDT
> GET wallet:sync:1
```

---

## 8. Troubleshooting

### Issue 1: API Key Không Hợp Lệ

**Lỗi:**
```
Error: Invalid API Key
```

**Giải Pháp:**
1. Kiểm tra lại API Key từ Binance Testnet
2. Đảm bảo trong file `.env` không có khoảng trắng thừa
3. Kiểm tra encoding (UTF-8 không BOM)
4. Regenerate API Key nếu cần

### Issue 2: Connection Timeout

**Lỗi:**
```
Error: ECONNREFUSED 127.0.0.1:3306
```

**Giải Pháp:**
1. Kiểm tra MySQL server đang chạy: `mysql -u root -p`
2. Kiểm tra DB_HOST và DB_PORT trong `.env`
3. Nếu cần, update database URL: `DB_HOST=localhost DB_PORT=3306`

### Issue 3: Balance Discrepancy

**Lỗi:**
```
Balance mismatch: Local 100.00 vs Exchange 99.50
```

**Giải Pháp:**
1. Trigger manual sync: `POST /wallets/sync?currencyId=1`
2. Check transaction logs: `SELECT * FROM wallet_ledger`
3. Verify Binance Testnet balance trực tiếp
4. Run reconciliation: `POST /wallets/reconciliation-status`

### Issue 4: Redis Connection Failed

**Lỗi:**
```
Error: Could not connect to Redis
```

**Giải Pháp:**
1. Start Redis server: `redis-server`
2. Test connection: `redis-cli ping` (should return PONG)
3. Check REDIS_HOST và REDIS_PORT trong `.env`

---

## 9. Best Practices Cho Development

### 1. Tách Testnet & Mainnet Config

**Không làm:**
```bash
# Single .env cho cả testnet và mainnet
BINANCE_API_KEY=testnet_key
```

**Làm:**
```bash
# .env (testnet default)
TRADING_ENVIRONMENT=testnet
BINANCE_TESTNET_API_KEY=...

# .env.production (mainnet)
TRADING_ENVIRONMENT=mainnet
BINANCE_MAINNET_API_KEY=...
```

### 2. Bao Giờ Commit Credentials

**Thêm vào `.gitignore`:**
```
.env
.env.local
.env.*.local
.DS_Store
node_modules/
dist/
```

### 3. Secure API Keys

**Dùng AWS Secrets Manager / HashiCorp Vault cho production:**
```typescript
// src/config/secrets.service.ts
async getSecret(name: string): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    // Load từ AWS Secrets Manager
    return awsSecretsManager.getSecret(name);
  }
  // Load từ .env
  return process.env[name];
}
```

### 4. Log Rotation

**Tránh log API Keys:**
```typescript
// Sai:
logger.info(`Calling Binance API with key: ${apiKey}`);

// Đúng:
logger.info(`Calling Binance API with key: ${apiKey.substring(0, 8)}...`);
```

### 5. Health Checks

**Thêm endpoint kiểm tra kết nối:**
```bash
curl http://localhost:3000/health/readiness
```

**Response:**
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "binance": "ok"
  }
}
```

---

## 10. Tiếp Theo: Migration Sang Mainnet

Khi sẵn sàng chuyển sang Binance Mainnet:

1. **Tạo mainnet API Key** từ https://www.binance.com/
2. **Update `.env.production`:**
   ```bash
   TRADING_ENVIRONMENT=mainnet
   BINANCE_MAINNET_API_KEY=your_real_key
   BINANCE_MAINNET_API_SECRET=your_real_secret
   ```

3. **Run smoke tests** trước deployment

4. **Blue-green deployment** để minimize downtime

5. **Monitor closely** trong 24h đầu
