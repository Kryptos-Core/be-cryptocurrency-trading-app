# Cách sử dụng Redis - Dự án hiện tại

Redis dùng cho **cache**, **pub/sub**, **distributed lock** (ví dụ khớp lệnh theo cặp), và các tác vụ realtime/queue phụ thuộc cấu hình module. Chi tiết triển khai: xem code `RedisService` và module `matching`.

## Biến môi trường

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=   # trong docker-compose.infrastructure.yml Redis chạy với requirepass nếu set
REDIS_DB=0
```

Giá trị mẫu đầy đủ nằm trong [`env.example`](../env.example) ở root backend.

## Chạy Redis (và MySQL) bằng Docker

Từ thư mục `be-cryptocurrency-trading-app`, dùng cùng file `.env` với app:

```bash
docker compose -f docker-compose.infrastructure.yml --env-file .env up -d
```

Chỉ Redis:

```bash
docker compose -f docker-compose.infrastructure.yml --env-file .env up -d redis
```

## Thực hành

- Đặt **TTL** cho key cache tạm.
- **Invalidate** cache khi dữ liệu nguồn thay đổi.
- Không log chuỗi chứa mật khẩu Redis.

Tài liệu liên quan: [README.md](../README.md) (hạ tầng), module **matching** (lock khớp lệnh).

## Key bổ sung (theo module)

- **Đăng nhập WalletConnect công khai:** prefix `wc:auth:session:{sessionId}` — TTL ~5 phút; lưu `wcUri`, message, `status`, `address`, `signature` khi có. Chi tiết luồng: **[WALLETCONNECT.md](WALLETCONNECT.md)**.
