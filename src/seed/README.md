# Seed data

Xóa dữ liệu liên quan user (và users) rồi **chỉ seed users** từ `data/users.json`. Currencies và market pairs không seed — dùng **sync từ Binance** (POST /api/v1/exchange/sync-info).

## Chạy

```bash
npm run db:seed
# hoặc
npm run db:reset
```

Cần có `.env` với `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`.

**Sau khi seed:** Chỉ có users. Để có currencies + market pairs: đăng nhập rồi gọi `POST /api/v1/exchange/sync-info` (hoặc sync từ Binance theo docs).

## Cấu trúc dữ liệu

### `data/users.json`

Danh sách user được seed (UUID v7):

```json
[
  { "email": "admin@example.com", "password": "Admin@123!", "first_name": "Admin", "last_name": "User", "status": "ACTIVE" }
]
```

Có thể thêm/sửa user trong file rồi chạy lại `npm run db:seed`.

### Currencies & market pairs

Không còn seed từ file. Dùng **sync từ exchange** (xem `docs/MARKET_AND_PRICE_SOURCE.md`): gọi `POST /api/v1/exchange/sync-info` để lấy danh mục từ Binance vào DB.
