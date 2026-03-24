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

File: [`data/users.json`](data/users.json)

Mỗi phần tử hỗ trợ tối thiểu: `email`, `password`, `first_name`, `last_name`, `status`, `role` (ví dụ `ADMIN`, `TRADER`, `MARKET_MAKER`, …). UUID user do seed sinh khi chạy. Xác minh định danh dùng cột `identity_verified` (migration), không dùng role `VERIFIED_USER`.

Ví dụ cấu trúc một dòng:

```json
{
  "email": "max@circle-vn.com",
  "password": "Admin@123!",
  "first_name": "Admin",
  "last_name": "User",
  "status": "ACTIVE",
  "role": "ADMIN"
}
```

Sửa `data/users.json` rồi chạy lại `npm run db:seed` để áp dụng (lưu ý: seed xóa user cũ theo logic trong `run-seed.ts`).

## Danh sách đăng nhập thử (sau seed mặc định)

Xem bảng tài khoản trong [README.md](../../README.md) gốc backend (đồng bộ với `users.json`).
