# Cách sử dụng Redis - Dự án hiện tại

Redis dùng cho **cache**, **pub/sub**, **distributed lock** (khớp lệnh theo cặp, relay outbox), và các tác vụ realtime/queue phụ thuộc cấu hình module. Chi tiết triển khai: xem `RedisService`, module `matching`, và `OutboxRelayService`.

## Biến môi trường

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=   # trong docker-compose.infrastructure.yml Redis chạy với requirepass nếu set
REDIS_DB=0
```

Giá trị mẫu đầy đủ nằm trong [`.env.development.example`](../.env.development.example) (và các file `.env.*.example` khác) ở root backend.

## Chạy Redis (và MySQL) bằng Docker

Từ thư mục `be-cryptocurrency-trading-app`, dev mặc định dùng `.env.development`:

```bash
npm run docker:infra:up
```

Chỉ Redis:

```bash
npm run docker:infra:up:redis
```

## Thực hành

- Đặt **TTL** cho key cache tạm.
- **Invalidate** cache khi dữ liệu nguồn thay đổi.
- Không log chuỗi chứa mật khẩu Redis.

Tài liệu liên quan: [README.md](../README.md) (hạ tầng), module **matching** (lock khớp lệnh).

## Key bổ sung (theo module)

- **Đăng nhập WalletConnect công khai:** prefix `wc:auth:session:{sessionId}` — TTL ~5 phút; lưu `wcUri`, message, `status`, `address`, `signature` khi có. Chi tiết luồng: **[WALLETCONNECT.md](WALLETCONNECT.md)**.

- **Matching Engine — Redis lock:** prefix `matching:lock:{pairId}` — TTL 10s, giá trị là hex token ngẫu nhiên; xóa atomic bằng Lua script (chỉ DEL nếu value khớp). Chi tiết: `matching/matching.service.ts`.

- **Circuit Breaker:** hai prefix per pair:
  - `circuit:halt:{pairId}` — tồn tại khi pair đang bị halt; TTL = `haltDurationSec` (cấu hình). Giá trị là JSON `{ triggeredAt, referencePrice, currentPrice }`. Admin xóa thủ công bằng `resumeTrading()`.
  - `circuit:price:{pairId}` — giá tham chiếu đầu cửa sổ rolling; TTL = `windowSec`. Dùng để phát hiện biến động giá vượt ngưỡng.
  - Chi tiết: `matching/circuit-breaker.service.ts`.

- **Idempotency key đặt lệnh:** prefix `order:idempotency:{userId}:{key}` — TTL 24h; lưu snapshot JSON của Order để tránh tạo lệnh trùng. Chi tiết: `orders/orders.service.ts`.

- **Outbox relay — distributed lock:** `outbox:relay:lock` — một instance drain hiệu quả; TTL trong `outbox-relay.service.ts`. Semantics relay: [ARCHITECTURE_FULL_ROLLOUT.md](ARCHITECTURE_FULL_ROLLOUT.md).
