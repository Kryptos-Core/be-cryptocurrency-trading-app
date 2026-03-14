# Seed data

Xóa dữ liệu liên quan user (và users) rồi **seed users** từ `data/users.json`. Currencies và market pairs sẽ được backend **bootstrap tự động từ Binance khi khởi động** nếu catalog đang rỗng.

## Chạy

```bash
npm run db:seed
# hoặc
npm run db:reset
```

Cần có `.env` với `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`.

**Sau khi seed:** Khởi động backend là đủ. Nếu DB đang rỗng ở phần market catalog, backend sẽ tự sync dữ liệu thật từ Binance vào DB.

**Fail-fast:** nếu sync Binance thất bại trong lúc catalog đang rỗng, backend sẽ fail startup để tránh trạng thái nửa sống nửa chết (login được nhưng không có market).

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

Không còn coi frontend/manual sync là bootstrap path chính. Backend startup sẽ tự sync dữ liệu thật từ Binance nếu `currencies` / `markets` đang rỗng.

`POST /api/v1/exchange/sync-info` vẫn được giữ lại cho admin/manual refresh hoặc re-sync khi cần.
