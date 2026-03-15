# Mục đích của Deposits API (PayOS)

Module Deposits xử lý luồng nạp tiền fiat thông qua PayOS.

## Các route

- POST /api/v1/deposits
  - Tạo ngữ cảnh thanh toán PayOS cho người dùng hiện tại
- GET /api/v1/deposits
  - Liệt kê các lệnh nạp tiền fiat của người dùng hiện tại
- POST /api/v1/deposits/payos-webhook
  - Nhận webhook và cập nhật trạng thái nạp tiền

## Hành vi hiện tại

- Service gọi API tài nguyên PayOS SDK v2: `paymentRequests.create(...)`
- Việc xác thực Webhook sử dụng `payOS.webhooks.verify(...)`
- Khi thanh toán thành công, backend đánh giá lệnh nạp tiền fiat là đã thanh toán và cộng tiền vào ví trong tầng service.

## Các biến môi trường PayOS cần thiết

- PAYOS_CLIENT_ID
- PAYOS_API_KEY
- PAYOS_CHECKSUM_KEY
- PAYOS_RETURN_URL
- PAYOS_CANCEL_URL

Môi trường Production yêu cầu tất cả các biến trên.
