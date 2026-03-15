# Cách sử dụng Swagger - Dự án hiện tại

Swagger được kích hoạt khi `NODE_ENV` không phải là production.

## Các đường dẫn (URLs)

- Giao diện người dùng (UI): http://localhost:3000/api/docs
- Dữ liệu JSON: http://localhost:3000/api/docs-json

## Tiền tố gốc của API (API base prefix)

Tất cả các route REST đều nằm dưới tiền tố:

- /api/v1

## Xác thực trong Swagger

Các endpoint được bảo vệ yêu cầu JWT bearer token thông qua nút "Authorize".

## Khuyến nghị

Sử dụng Swagger như một nguồn thông tin chính xác duy nhất cho cấu trúc yêu cầu/phản hồi (request/response shapes) và các endpoint được bảo vệ bởi RBAC.
