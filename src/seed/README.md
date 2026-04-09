# Seed dữ liệu

Script seed xóa dữ liệu liên quan user (và users) rồi **tạo lại users** từ file JSON. **Currencies** và **cặp thị trường (market pairs)** không phụ thuộc file seed tĩnh: backend **bootstrap từ Binance** khi khởi động nếu catalog trong DB đang rỗng.

## Chạy

Từ thư mục `be-cryptocurrency-trading-app`:

```bash
npm run db:seed
# tương đương
npm run db:reset
```

Cần file `.env` hợp lệ (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`). Nên chạy `npm run migration:run` trước lần đầu seed.

## Sau khi seed

1. Khởi động backend (`npm run start:dev`).
2. Nếu bảng markets/currencies trống, ứng dụng sẽ tự sync từ Binance (theo `EXCHANGE_MODE`, testnet, v.v.).
3. **Fail-fast:** nếu sync Binance thất bại khi catalog đang rỗng, process có thể thoát sớm — kiểm tra log và biến môi trường Binance.

Đồng bộ thủ công (JWT + quyền admin): `POST /api/v1/exchange/sync-info`.

## Nguồn dữ liệu users

Thứ tự: biến môi trường `SEED_USERS_JSON` (đường dẫn tuyệt đối hoặc tương đối cwd) → `src/seed/data/users.json` nếu tồn tại → nếu không thì `src/seed/data/users.json.example`.

Mỗi phần tử bắt buộc: `email`, `password`, `role`; khuyến nghị `status` (`ACTIVE` \| `BANNED` \| `PENDING`). Không còn gán `role` theo email trong code. UUID user do seed sinh khi chạy.

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

Copy [`data/users.json.example`](data/users.json.example) thành `data/users.json` để tùy chỉnh local (`users.json` không commit). Chạy lại `npm run db:seed` sau khi sửa file.

## Danh sách đăng nhập thử (sau seed mặc định)

Xem bảng trong [README.md](../../README.md) gốc backend.
