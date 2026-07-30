# Hướng dẫn Seed Users vào Production Database (VPS)

> **Phạm vi:** Seed dữ liệu người dùng từ file `users.json` (mã hoá AES-256-GCM) vào database PostgreSQL production trên VPS.
>
> **Bảo mật:** Mật khẩu plaintext không bao giờ được commit; toàn bộ seed file được mã hoá trước khi deploy.

---

## Tổng quan kiến trúc

```
Developer Machine                          VPS Production
─────────────────                         ───────────────
users.json.example                         ┌─────────────────────────────────────┐
      │                                   │          Docker Stack               │
      ▼                                   │                                     │
users.json  ── encrypt ──► users.json.enc  │  NestJS (dist/)                    │
      │                                   │  PostgreSQL (CORE_DB_*)             │
SEED_DATA_ENCRYPTION_KEY (trong .env)     │  Redis                             │
      │                                   │  Kafka                             │
      ▼                                   │  ...                               │
Transfer .enc file + key sang VPS          └─────────────────────────────────────┘
      │
      ▼
  db:seed:prod
      │
      ▼
 PostgreSQL production ← users seeded (password_hash via bcrypt)
```

---

## Quy ước tên biến trong guide

| Biến | Ý nghĩa |
|------|---------|
| `<PROJECT_ROOT>` | Thư mục gốc project: `be-cryptocurrency-trading-app` |
| `<SEED_KEY>` | Giá trị `SEED_DATA_ENCRYPTION_KEY` (64 hex chars) |
| `<VPS_USER>` | User SSH trên VPS (ví dụ: `deploy`, `root`) |
| `<VPS_HOST>` | IP hoặc domain của VPS |
| `<DB_PASSWORD>` | Password của PostgreSQL user `crypto_user` |

---

## Bước 0 — Chuẩn bị local (Developer Machine)

### 0.1. Clone repo (nếu chưa có)

```bash
git clone https://github.com/your-org/be-cryptocurrency-trading-app.git
cd be-cryptocurrency-trading-app
```

### 0.2. Cài đặt phụ thuộc

```bash
npm install
```

### 0.3. Copy file môi trường

```bash
cp .env.prod.example .env.prod
# Hoặc copy từ VPS nếu có sẵn:
# scp <VPS_USER>@<VPS_HOST>:/opt/crypto-trading/.env.prod .env.prod
```

### 0.4. Build production

```bash
npm run build
```

Sau bước này, output sẽ nằm ở thư mục `dist/`.

---

## Bước 1 — Chỉnh sửa danh sách users

### 1.1. Copy file mẫu

```bash
cp src/seed/data/users.json.example src/seed/data/users.json
```

### 1.2. Mở và chỉnh sửa

```bash
# Mở bằng editor bất kỳ
code src/seed/data/users.json
# hoặc
nano src/seed/data/users.json
```

### 1.3. Cấu trúc mỗi user

```json
{
  "email": "admin@example.com",
  "password": "ChangeMeAdmin!",
  "first_name": "Admin",
  "last_name": "User",
  "status": "ACTIVE",
  "role": "ADMIN"
}
```

| Trường | Bắt buộc | Mô tả | Giá trị hợp lệ |
|--------|:--------:|-------|-----------------|
| `email` | ✅ | Email đăng nhập (sẽ lowercase tự động) | string, unique |
| `password` | ✅ | Mật khẩu plaintext (sẽ hash bằng bcrypt) | string |
| `first_name` | ❌ | Tên | string |
| `last_name` | ❌ | Họ | string |
| `status` | ❌ | Trạng thái (mặc định: `ACTIVE`) | `ACTIVE`, `BANNED`, `PENDING` |
| `role` | ✅ | Vai trò | `TRADER`, `ADMIN`, `RISK_OFFICER`, `SUPPORT_AGENT`, `MARKET_MAKER`, `FINANCE_MANAGER` |

### 1.4. Ví dụ đầy đủ

```json
[
  {
    "email": "admin@yourdomain.com",
    "password": "SuperSecretAdmin!2026",
    "first_name": "System",
    "last_name": "Administrator",
    "status": "ACTIVE",
    "role": "ADMIN"
  },
  {
    "email": "risk@yourdomain.com",
    "password": "RiskOfficer!2026",
    "first_name": "Risk",
    "last_name": "Officer",
    "status": "ACTIVE",
    "role": "RISK_OFFICER"
  },
  {
    "email": "trader1@yourdomain.com",
    "password": "TraderOne!2026",
    "first_name": "Alice",
    "last_name": "Trader",
    "status": "ACTIVE",
    "role": "TRADER"
  },
  {
    "email": "support@yourdomain.com",
    "password": "SupportAgent!2026",
    "first_name": "Support",
    "last_name": "Agent",
    "status": "ACTIVE",
    "role": "SUPPORT_AGENT"
  }
]
```

### 1.5. Validation

Script seed sẽ tự động validate các rule sau khi chạy. Nếu có lỗi, script sẽ dừng và thông báo.

---

## Bước 2 — Mã hoá seed file (AES-256-GCM)

### 2.1. Sinh key mã hoá (nếu chưa có)

```bash
openssl rand -hex 32
```

Output sẽ là 64 ký tự hex, ví dụ:
```
3a7f8b2c1e4d9f0a3b5c7e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2
```

### 2.2. Thêm key vào `.env.prod`

```bash
# Thêm dòng này vào .env.prod (hoặc .env.development)
echo "SEED_DATA_ENCRYPTION_KEY=<key-cua-ban>" >> .env.prod
```

### 2.3. Mã hoá file seed

```bash
SEED_DATA_ENCRYPTION_KEY=<key-cua-ban> npm run seed:encrypt
```

Script sẽ:
1. Đọc `src/seed/data/users.json`
2. Mã hoá bằng AES-256-GCM
3. Ghi output ra `src/seed/data/users.json.enc`
4. Ghi đè `src/seed/data/users.json` bằng dummy content `[]`

### 2.4. Xác nhận các file sau khi mã hoá

```bash
ls -la src/seed/data/
```

Kết quả mong đợi:

```
users.json          ← chỉ chứa [] (an toàn commit)
users.json.enc      ← ciphertext mã hoá (lưu trữ cẩn thận)
```

### 2.5. Lưu trữ key an toàn

```
QUAN TRỌNG:
- Key này phải được lưu trữ ở nơi an toàn (password manager, secret vault)
- Key được dùng cả ở local (encrypt) và trên VPS (decrypt + seed)
- KHÔNG commit key vào git
- KHÔNG gửi key qua chat/email không mã hoá
```

**Khuyến nghị:** Dùng 1Password, HashiCorp Vault, hoặc AWS Secrets Manager để lưu key.

---

## Bước 3 — Copy file đã mã hoá lên VPS

### 3.1. Copy `users.json.enc` lên VPS

```bash
# Qua scp (secure copy)
scp src/seed/data/users.json.enc <VPS_USER>@<VPS_HOST>:/tmp/users.json.enc
```

### 3.2. Copy key qua kênh an toàn

**Cách 1 — Nhập trực tiếp trên VPS (khuyến nghị cho production)**

SSH vào VPS, thêm vào `.env.prod`:

```bash
ssh <VPS_USER>@<VPS_HOST>
# Trên VPS:
nano /opt/crypto-trading/.env.prod
# Thêm dòng:
# SEED_DATA_ENCRYPTION_KEY=<key-cua-ban>
```

**Cách 2 — Copy file `.env.prod` đã có key**

```bash
# Trên local, thêm key vào .env.prod
echo "SEED_DATA_ENCRYPTION_KEY=<key-cua-ban>" >> .env.prod

# Copy lên VPS (file này nên được truyền qua kênh an toàn)
scp .env.prod <VPS_USER>@<VPS_HOST>:/tmp/.env.prod.seeded
ssh <VPS_USER>@<VPS_HOST> "mv /tmp/.env.prod.seeded /opt/crypto-trading/.env.prod"
```

**Cách 3 — Dùng `sops` (nếu đã cấu hình)**

```bash
# Encrypt .env.prod với sops trước khi gửi
sops -e .env.prod > .env.prod.enc
scp .env.prod.enc <VPS_USER>@<VPS_HOST>:/tmp/
# Trên VPS:
sops -d /tmp/.env.prod.enc > /opt/crypto-trading/.env.prod
```

### 3.3. Di chuyển file seed vào đúng vị trí

```bash
ssh <VPS_USER>@<VPS_HOST>
sudo mv /tmp/users.json.enc /opt/crypto-trading/src/seed/data/users.json.enc
sudo chown deploy:deploy /opt/crypto-trading/src/seed/data/users.json.enc
```

---

## Bước 4 — Chạy seed trên Production

### 4.1. Cách A — Chạy trực tiếp trong container (Khuyến nghị)

```bash
ssh <VPS_USER>@<VPS_HOST>
cd /opt/crypto-trading

# Chạy seed script trong container
docker exec -it crypto-trading-app-1 node -r tsconfig-paths/register dist/seed/run-seed.js
```

> **Lưu ý:** Container phải được build với seed scripts trong `dist/`. Đảm bảo `Dockerfile.prod` đã copy `src/seed/` vào image.

### 4.2. Cách B — Chạy từ source trên VPS

```bash
ssh <VPS_USER>@<VPS_HOST>
cd /opt/crypto-trading

# Pull code mới nhất
git pull origin main

# Build
npm run build

# Chạy seed với production env
NODE_ENV=production SEED_DATA_ENCRYPTION_KEY=<key> npm run db:seed:prod
```

### 4.3. Cách C — Dùng Docker Compose override (nếu có)

```bash
# Tạo override file tạm thời để chạy seed
ssh <VPS_USER>@<VPS_HOST>
cd /opt/crypto-trading

# Chạy seed bằng docker-compose exec
docker compose exec -T app node -r tsconfig-paths/register dist/seed/run-seed.js
```

### 4.4. Kiểm tra kết nối database trước khi seed

```bash
# Kiểm tra container đang chạy
docker ps | grep crypto

# Kiểm tra logs
docker logs crypto-trading-app-1 --tail 20

# Kiểm tra kết nối DB từ container
docker exec -it crypto-trading-app-1 sh -c "pg_isready -h postgres -U crypto_user -d crypto_trading_platform"
```

### 4.5. Chạy seed thực tế

```bash
# Đảm bảo env vars đúng
export NODE_ENV=production
export SEED_DATA_ENCRYPTION_KEY=<key-cua-ban>

# Chạy seed
npm run db:seed:prod
```

### 4.6. Output mong đợi

```
🗑️  Clearing user-related data (wallet_ledger, wallets, orders, trades, deposits, withdrawals, users, plus optional legacy tables)...
✅ Cleared.
   (seed file is encrypted — decrypting with SEED_DATA_ENCRYPTION_KEY)
📄 Seed users file: /opt/crypto-trading/src/seed/data/users.json.enc
📥 Seeding 4 users...
✅ Users seeded.

🎉 Seed done. Users imported.
   Currencies & market pairs will sync automatically from Binance on backend startup if catalog is empty.
   Login e.g. admin@yourdomain.com / (password from your seed file)
```

---

## Bước 5 — Xác minh kết quả

### 5.1. Kiểm tra users đã được tạo

```bash
# Truy cập PostgreSQL trong container
docker exec -it crypto-trading-db-1 psql -U crypto_user -d crypto_trading_platform

# Chạy query
SELECT user_id, email, first_name, last_name, status, role, created_at FROM users;
```

### 5.2. Xác minh password hash

```bash
# Kiểm tra password_hash đã được tạo (không phải plaintext)
SELECT email, password_hash, length(password_hash) AS hash_length FROM users;
```

Output mong đợi:

```
             email              |                              password_hash                               | hash_length
-------------------------------+------------------------------------------------------------------------+-------------
 admin@yourdomain.com          | $2a$12$............                                                            |          60
 risk@yourdomain.com           | $2a$12$............                                                            |          60
 trader1@yourdomain.com        | $2a$12$............                                                            |          60
 support@yourdomain.com        | $2a$12$............                                                            |          60
(4 rows)
```

- Password hash bcrypt có độ dài **60 ký tự**, bắt đầu bằng `$2a$12$` (salt rounds = 12)
- **KHÔNG BAO GIỜ** có plaintext password trong database

### 5.3. Xác minh email unique

```bash
SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;
```

Kết quả mong đợi: **không có dòng nào** (0 rows).

### 5.4. Login thử

```bash
curl -X POST https://api-kryptos-core.maxnoah.io.vn/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"SuperSecretAdmin!2026"}'
```

Output mong đợi:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 86400,
  "user": {
    "user_id": "...",
    "email": "admin@yourdomain.com",
    "role": "ADMIN"
  }
}
```

---

## Bước 6 — Dọn dẹp và bảo mật

### 6.1. Xoá plaintext seed file trên VPS

```bash
# Xác nhận không có users.json plaintext trên VPS
ls -la /opt/crypto-trading/src/seed/data/

# Nếu có users.json (plaintext), xoá ngay
sudo rm /opt/crypto-trading/src/seed/data/users.json
```

### 6.2. Xoá file tạm thời

```bash
# Xoá các file tạm nếu có
rm -f /tmp/users.json.enc
rm -f /tmp/.env.prod.seeded
```

### 6.3. Xoá users.json.example khỏi git (nếu muốn)

```bash
# users.json.example vẫn nên giữ trong repo như template
# Nhưng users.json plaintext KHÔNG BAO GIỜ được commit
git rm --cached src/seed/data/users.json  # Nếu đã add vào git
```

### 6.4. Cập nhật `.gitignore`

```bash
# Thêm vào .gitignore nếu chưa có
echo "src/seed/data/users.json" >> .gitignore
echo "src/seed/data/users.json.enc" >> .gitignore
```

> **Lưu ý:** `users.json.enc` có thể commit nếu team cần, nhưng `SEED_DATA_ENCRYPTION_KEY` phải luôn ở ngoài git.

---

## Troubleshooting

### Lỗi: `SEED_DATA_ENCRYPTION_KEY env var is required`

```bash
# Kiểm tra key đã được set
echo $SEED_DATA_ENCRYPTION_KEY

# Set key
export SEED_DATA_ENCRYPTION_KEY=<key-cua-ban>
npm run db:seed:prod
```

### Lỗi: `users.json.enc not found`

```bash
# Kiểm tra file tồn tại
ls -la /opt/crypto-trading/src/seed/data/

# Copy lại nếu thiếu
scp src/seed/data/users.json.enc <VPS_USER>@<VPS_HOST>:/opt/crypto-trading/src/seed/data/
```

### Lỗi: `ECONNREFUSED` kết nối PostgreSQL

```bash
# Kiểm tra PostgreSQL container đang chạy
docker ps | grep postgres

# Kiểm tra log
docker logs crypto-trading-db-1 --tail 30

# Restart nếu cần
docker compose restart postgres
```

### Lỗi: `Seed users[0] missing string "email"`

```bash
# Kiểm tra file JSON hợp lệ
# Trên local:
node -e "JSON.parse(require('fs').readFileSync('src/seed/data/users.json.enc','utf8'))"

# Nếu dùng encrypted file, giải mã trước để kiểm tra
SEED_DATA_ENCRYPTION_KEY=<key> npm run seed:decrypt
```

### Lỗi: `Seed users[0] unknown "role" XXX`

Kiểm tra `role` trong file JSON phải là một trong các giá trị:
- `TRADER`
- `ADMIN`
- `RISK_OFFICER`
- `SUPPORT_AGENT`
- `MARKET_MAKER`
- `FINANCE_MANAGER`

### Lỗi: Duplicate key constraint (email đã tồn tại)

Script seed tự động TRUNCATE bảng `users` trước khi insert. Nếu vẫn lỗi, kiểm tra:

```bash
# Kiểm tra email trùng lặp trong DB
docker exec -it crypto-trading-db-1 psql -U crypto_user -d crypto_trading_platform \
  -c "SELECT email FROM users GROUP BY email HAVING COUNT(*) > 1;"
```

### Lỗi: Container không có seed scripts

```bash
# Build lại image với seed scripts
docker build -f Dockerfile.prod -t crypto-trading-app:latest .
docker compose -f docker-compose.prod.yml up -d --build app
```

---

## Appendix — Một số câu lệnh hữu ích

### Xem users đã seed

```bash
docker exec -it crypto-trading-db-1 psql -U crypto_user -d crypto_trading_platform \
  -c "SELECT email, role, status, created_at FROM users ORDER BY created_at;"
```

### Đếm số users

```bash
docker exec -it crypto-trading-db-1 psql -U crypto_user -d crypto_trading_platform \
  -c "SELECT role, COUNT(*) FROM users GROUP BY role;"
```

### Xem seed log gần nhất

```bash
docker logs crypto-trading-app-1 --since 5m | grep -E "(seed|Successfully|Cleared)"
```

### Reset hoàn toàn và seed lại

```bash
# ⚠️ CẢNH BÁO: Xoá toàn bộ dữ liệu liên quan đến users
# CHỈ chạy trong môi trường development hoặc khi thật sự cần reset

NODE_ENV=production SEED_DATA_ENCRYPTION_KEY=<key> npm run db:seed:prod
```

### Giải mã để xem nội dung (debugging)

```bash
SEED_DATA_ENCRYPTION_KEY=<key> npm run seed:decrypt
```

---

## Security Checklist

- [ ] `users.json.enc` đã được copy lên VPS
- [ ] `SEED_DATA_ENCRYPTION_KEY` đã được set trong `.env.prod` trên VPS (không phải trong code)
- [ ] `users.json` plaintext đã bị ghi đè bằng `[]` hoặc xoá
- [ ] Không có `users.json` plaintext trong git history
- [ ] Password trong file seed là mạnh (ít nhất 12 ký tự, có uppercase + lowercase + number + special)
- [ ] Không có user nào có role `ADMIN` với password yếu
- [ ] Sau khi seed thành công, đổi password của tất cả users (đặc biệt là ADMIN) ngay lập tức qua API hoặc trực tiếp trong DB
- [ ] `users.json.enc` được backup cùng với `.env.prod` trong secret management system
