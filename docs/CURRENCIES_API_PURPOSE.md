# Mục đích của Currencies API

Module Currencies là danh mục chính của các tài sản có thể giao dịch.
Các module khác (thị trường, ví, lệnh) tham chiếu ID tiền tệ từ đây.

## Trách nhiệm chính

- Quản lý metadata của tiền tệ (ký hiệu, tên, độ chính xác - precision, các cờ trạng thái)
- Cung cấp danh sách các tiền tệ đang hoạt động và có thể giao dịch cho UI và việc xác thực
- Hỗ trợ các thao tác CRUD cho quản trị viên với phân quyền RBAC

## Các route chính (có tiền tố global)

- GET /api/v1/currencies
- GET /api/v1/currencies/active
- GET /api/v1/currencies/tradable
- GET /api/v1/currencies/:id
- GET /api/v1/currencies/symbol/:symbol
- POST /api/v1/currencies (admin)
- PATCH /api/v1/currencies/:id (admin)
- DELETE /api/v1/currencies/:id (admin)

## Tại sao module này lại quan trọng

- Module Markets sử dụng tiền tệ cơ sở (base) và tiền tệ định giá (quote) từ danh mục này.
- Wallets và ledger (sổ cái) ánh xạ số dư theo ID tiền tệ.
- Việc xác thực giao dịch phụ thuộc vào các cờ hoạt động/có thể giao dịch của tiền tệ.
