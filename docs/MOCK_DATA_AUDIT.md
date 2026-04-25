# Kiểm kê mock data - be-cryptocurrency-trading-app

## Phạm vi đánh giá

Tài liệu này kiểm kê các nguồn dữ liệu giả/mô phỏng trong backend, gồm:
- Dữ liệu seed có thể được nạp vào database.
- Dữ liệu mô phỏng khi chạy ứng dụng theo cấu hình.
- Dữ liệu mock trong test (Jest), không đi vào runtime production.

## 1) Seed users trong source

### Nguồn dữ liệu
- File dữ liệu chính: `src/seed/data/users.json`
- File mẫu fallback: `src/seed/data/users.json.example`
- Script nạp seed: `src/seed/run-seed.ts`
- Parser/validator: `src/seed/seed-users-json.util.ts`
- Resolver đường dẫn seed: `src/seed/seed-users-path.util.ts`

### Nội dung mock data
- Danh sách user mẫu gồm các role như: `ADMIN`, `TRADER`, `RISK_OFFICER`, `SUPPORT_AGENT`, `MARKET_MAKER`, `FINANCE_MANAGER`.
- Có đủ trường mô phỏng đăng nhập và hồ sơ cơ bản: `email`, `password`, `first_name`, `last_name`, `status`, `role`.

### Dùng để làm gì
- Hỗ trợ dựng môi trường local/dev nhanh sau migration.
- Tạo sẵn tài khoản test để kiểm tra phân quyền, đăng nhập, luồng vận hành.

### Có cần thiết không
- Với local/dev/test tích hợp: **cần thiết** (giúp rút ngắn thời gian setup).
- Với production: **không bắt buộc** dùng bộ seed mặc định này.
- Nếu không muốn dùng dữ liệu mặc định trong repo, có thể set `SEED_USERS_JSON` để trỏ sang file riêng.

### Lưu ý
- Mật khẩu trong file seed là dữ liệu mẫu, không được dùng cho môi trường thật.
- Tránh commit dữ liệu user thật vào file seed.

## 2) Mock exchange khi chạy ứng dụng

### Nguồn dữ liệu
- Service mock: `src/modules/exchange/mock/mock-exchange.service.ts`
- Cấu hình liên quan trong env/docs: `docs/ENV_CONFIG_USAGE.md`

### Nội dung mock data
- Số dư giả trả về từ config `MOCK_EXCHANGE_BALANCE` (mặc định 10000).
- Giá giả cho trạng thái lệnh `MOCK_EXCHANGE_ORDER_STATUS_PRICE` (mặc định 50000).
- Các response giả cho create/cancel/get status/verify transaction/withdrawal.

### Dùng để làm gì
- Cho phép chạy và kiểm thử các luồng trading khi chưa kết nối sàn thật.
- Hữu ích khi test logic nghiệp vụ mà không phụ thuộc API exchange bên ngoài.

### Có cần thiết không
- Trong dev/offline/CI logic test: **cần thiết**.
- Trong production (khi cần dữ liệu giao dịch thật): **không nên dùng**.
- Chỉ có hiệu lực khi đặt `EXCHANGE_MODE=mock`.

## 3) Mock data trong test (Jest)

### Thống kê nhanh
- Tổng số file `*.spec.ts`: 112
- Số file spec có từ khóa `mock`: 67
- Số file spec chứa đồng thời trường mẫu kiểu `email` + `password`: 5

### Đặc điểm
- Chủ yếu là in-memory mocks/stubs cho unit test, integration test, chaos test.
- Không phải dữ liệu seed runtime và không được dùng trực tiếp cho production.

### Dùng để làm gì
- Cô lập test khỏi hạ tầng thật (DB/external services) khi cần.
- Tái tạo tình huống lỗi/biên và kiểm chứng hành vi nghiệp vụ.

### Có cần thiết không
- Với chất lượng test và độ ổn định CI: **rất cần thiết**.
- Không ảnh hưởng trực tiếp đến runtime production nếu giữ đúng phạm vi test.

## Kết luận ngắn

- Mock/seed data trong repo backend hiện tại là hợp lý cho mục tiêu dev/test.
- Thành phần cần giữ:
  - Seed users (phục vụ bootstrap môi trường nhanh).
  - Mock exchange mode (phục vụ kiểm thử không phụ thuộc sàn).
  - Jest mocks trong spec (phục vụ kiểm thử tự động).
- Thành phần không nên dùng ở production:
  - Tài khoản seed mặc định.
  - `EXCHANGE_MODE=mock` cho luồng giao dịch thật.

## Đề xuất vận hành

- Đảm bảo môi trường production luôn dùng `EXCHANGE_MODE=binance` (hoặc provider thật tương đương).
- Tách file seed riêng theo môi trường qua `SEED_USERS_JSON` nếu cần kiểm soát dữ liệu tốt hơn.
- Định kỳ rà soát các mật khẩu mẫu trong seed để tránh dùng nhầm trong môi trường chia sẻ.
