# Seed dữ liệu

Script seed xóa dữ liệu liên quan user (và users) rồi **tạo lại users** từ file JSON. **Currencies** và **cặp thị trường (market pairs)** không phụ thuộc file seed tĩnh: backend **bootstrap từ Binance** khi khởi động nếu catalog trong DB đang rỗng.

## Mã hoá dữ liệu seed

Dữ liệu user trong `users.json` chứa email thật và passwords plaintext. Để tránh lộ thông tin khi file bị đọc trên server, seed data được **mã hoá bằng AES-256-GCM** trước khi lưu trữ.

### Thuật toán

- **AES-256-GCM** (AEAD — Authenticated Encryption with Associated Data)
- **Output format:** `iv_base64:authTag_base64:ciphertext_base64`
- **Key:** `SEED_DATA_ENCRYPTION_KEY` (64 hex characters = 32 bytes)
- Compatible với `WalletEncryptionService` và `BinanceCredentialsEncryptionService`

### Quy trình làm việc

**Thứ tự resolve file:**
1. `SEED_USERS_JSON` env var (đường dẫn tuỳ chỉnh)
2. `src/seed/data/users.json.enc` (encrypted — ưu tiên khi có)
3. `src/seed/data/users.json` (plaintext — chỉ dùng khi chưa có `.enc`)
4. `src/seed/data/users.json.example` (fallback)

### Generate encryption key

```bash
# Generate a 64-char hex key (32 bytes)
openssl rand -hex 32
```

Thêm vào `.env.development` hoặc `.env`:

```
SEED_DATA_ENCRYPTION_KEY=<your-generated-key>
```

### Encrypt (sau khi chỉnh sửa users.json)

```bash
# Mã hoá users.json → users.json.enc, ghi đè users.json bằng dummy []
SEED_DATA_ENCRYPTION_KEY=<key> npm run seed:encrypt

# Xem trước ciphertext (không ghi file)
SEED_DATA_ENCRYPTION_KEY=<key> npm run seed:encrypt:dry
```

### Decrypt (debugging)

```bash
# Giải mã users.json.enc và in ra console
SEED_DATA_ENCRYPTION_KEY=<key> npm run seed:decrypt
```

### Lưu ý bảo mật

- **Không bao giờ commit `users.json` plaintext** — file này được `.gitignore`
- **`users.json.enc` có thể commit** vì đã được mã hoá
- **Encryption key không bao giờ commit** — lưu trong `.env` hoặc secret manager
- **Nếu mất key:** toàn bộ seed data trong `.enc` không thể khôi phục — phải tạo lại từ plaintext

## Chạy seed

Từ thư mục `be-cryptocurrency-trading-app`:

```bash
# Development (đọc .env.development, tự động decrypt nếu có users.json.enc)
npm run db:seed

# Production (cần SEED_DATA_ENCRYPTION_KEY trong env)
SEED_DATA_ENCRYPTION_KEY=<key> npm run db:seed:prod
```

Cần file **`.env.development`** hợp lệ (`CORE_DB_HOST`, `CORE_DB_PORT`, `CORE_DB_USERNAME`, `CORE_DB_PASSWORD`, `CORE_DB_NAME` (hoặc fallback `DB_*`)) — `npm run db:seed` đặt `NODE_ENV=development`. Nên chạy `npm run migration:run` trước lần đầu seed.

## Sau khi seed

1. Khởi động backend (`npm run start:dev`).
2. Nếu bảng markets/currencies trống, ứng dụng sẽ tự sync từ Binance (theo `EXCHANGE_MODE`, testnet, v.v.).
3. **Fail-fast:** nếu sync Binance thất bại khi catalog đang rỗng, process có thể thoát sớm — kiểm tra log và biến môi trường Binance.

Đồng bộ thủ công (JWT + quyền admin): `POST /api/v1/exchange/sync-info`.

## Nguồn dữ liệu users

Thứ tự: biến môi trường `SEED_USERS_JSON` (đường dẫn tuyệt đối hoặc tương đối cwd) → `src/seed/data/users.json.enc` (encrypted) → `src/seed/data/users.json` nếu tồn tại → nếu không thì `src/seed/data/users.json.example`.

Mỗi phần tử bắt buộc: `email`, `password`, `role`; khuyến nghị `status` (`ACTIVE` | `BANNED` | `PENDING`). Không còn gán `role` theo email trong code. UUID user do seed sinh khi chạy.

Ví dụ một dòng:

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

Copy [`data/users.json.example`](data/users.json.example) thành `data/users.json` để tùy chỉnh local. **Sau khi chỉnh sửa, chạy `npm run seed:encrypt`** để mã hoá trước khi commit hoặc deploy.

## Danh sách đăng nhập thử (sau seed mặc định)

Xem bảng trong [README.md](../../README.md) gốc backend.
