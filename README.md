# CRYPTOCURRENCY TRADING APP (Backend)

NestJS API: auth, users, currencies, markets, wallets, exchange (Binance), WebSocket trading.

---

## Cấu trúc thư mục

```
be-cryptocurrency-trading-app/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/           # decorators, enums, exceptions, filters, guards, interceptors, repositories, services
│   ├── config/           # app, env, redis, swagger, typeorm
│   ├── entities/         # TypeORM entities
│   ├── migrations/       # DB migrations
│   ├── modules/
│   │   ├── auth/         # login, register, JWT
│   │   ├── users/
│   │   ├── currencies/
│   │   ├── markets/
│   │   ├── wallets/
│   │   ├── exchange/     # Binance, mock
│   │   ├── trading/      # WebSocket gateway, price feed
│   │   └── redis/
│   ├── seed/             # run-seed, data (json)
│   └── utils/
├── database/             # SQL seed (legacy)
├── docs/                 # Tài liệu API, setup
├── postman/
├── scripts/
├── env.example
├── package.json
├── tsconfig.json
└── docker-compose.infrastructure.yml
```

**Module:** mỗi module có `*.controller`, `*.module`, `*.service`, `dto/`, `repositories/` (nếu cần).

---

## Chạy

```bash
npm install
cp env.example .env
npm run start:dev
```

Swagger: `http://localhost:3000/api`

### App (Flutter) báo "connection refused" / "remote computer refused" khi login?

Backend chạy trên máy bạn (`localhost:3000`), nhưng **app chạy trên emulator hoặc điện thoại** — với chúng, `localhost` là chính emulator/điện thoại, không phải máy chạy BE.

| Chạy app trên | Base URL API (REST + WebSocket) cần dùng |
|---------------|------------------------------------------|
| **Android Emulator** | `http://10.0.2.2:3000` (10.0.2.2 = localhost của máy host) |
| **iOS Simulator** | `http://localhost:3000` hoặc `http://127.0.0.1:3000` (thường dùng chung với host) |
| **Điện thoại thật** (cùng WiFi với máy chạy BE) | `http://<IP_máy_chạy_BE>:3000` (vd: `http://192.168.1.105:3000`) |

**Cách làm:** Trong project Flutter, đổi **base URL** (biến env / config Dio) sang địa chỉ ở bảng trên. Ví dụ Android emulator: base URL = `http://10.0.2.2:3000`, path API = `/api/v1` → full URL login = `http://10.0.2.2:3000/api/v1/auth/login`. Sau khi đổi, restart app và thử login lại.

**"Connection Timeout" / "request took longer than 30s" / "Failed to load profile: Network error"?**  
Cùng một nguyên nhân: app **không kết nối được** tới backend (sai base URL hoặc firewall). Sửa base URL như bảng trên; nếu dùng **điện thoại thật** thì mở Windows Firewall cho phép **inbound** port **3000** (TCP).  

**Kiểm tra nhanh:** Trên máy đang chạy BE, mở browser hoặc PowerShell: `curl http://localhost:3000/api/v1/currencies/active`. Nếu trả về JSON thì BE ổn — lỗi chỉ do app (base URL / thiết bị không tới được máy BE).

### Request rất chậm (login 2+ phút, GET /users/me hoặc /currencies/active 2–3 giây)?

- **Login ~142s:** Kiểm tra `BCRYPT_ROUNDS` trong `.env` — nên để **10** (mặc định). Round 14+ sẽ chậm hàng chục giây. Nếu không set thì mặc định 10 là ổn. Nếu vẫn chậm, đo thời gian DB (sp_user_find_by_email) và bcrypt trong code.
- **GET /users/me, /currencies/active, /markets/tickers/all 2–4s:** Backend đang gọi **sp_market_find_by_id** nhiều lần (mỗi market một lần). Đây là N+1: cache (Redis) sẽ giúp lần gọi sau nhanh hơn; muốn nhanh ngay từ đầu có thể tối ưu batch/cache trong service.

**Lỗi "connect ETIMEDOUT" / WalletRepository (hoặc bất kỳ request nào lỗi MySQL)?**  
Nghĩa là **kết nối tới MySQL bị timeout** (mysql2 không nhận phản hồi từ DB trong thời gian chờ).

- **MySQL chạy bằng Docker** (container `crypto_trading_mysql`):  
  (1) Kiểm tra container đang chạy: `docker ps` — phải thấy `crypto_trading_mysql` với port `0.0.0.0:3306->3306`.  
  (2) Nếu container **Exited**: `docker start crypto_trading_mysql`.  
  (3) Thử kết nối từ host: `docker exec -it crypto_trading_mysql mysql -u crypto_user -p -e "SELECT 1"` (nhập `DB_PASSWORD` từ `.env`) — nếu chạy được thì MySQL trong container ổn; lỗi ETIMEDOUT có thể do mạng Docker/host.  
  (4) **Sau khi `docker restart` hoặc `docker compose up -d`: bắt buộc restart backend** — dừng `npm run dev` (Ctrl+C) rồi chạy lại. Pool cũ không dùng được sau khi container restart.  
  (5) **Thứ tự đúng:** `docker compose -f docker-compose.infrastructure.yml up -d` → **đợi 10–15 giây** (MySQL trong container cần thời gian "ready for connections") → mới chạy `npm run dev`. Nếu start backend ngay khi vừa up container, lần kết nối đầu có thể timeout.

**Vẫn timeout sau khi restart Docker?** Làm lần lượt: (A) Dừng hẳn backend (Ctrl+C), đợi 5s, chạy lại `npm run dev`. (B) Sau `docker compose up -d` hoặc `docker restart crypto_trading_mysql`, đợi 15s rồi mới start backend. (C) Kiểm tra port: `docker ps` có dòng `0.0.0.0:3306->3306/tcp` cho container mysql. (D) Trên Windows/Docker Desktop nếu vẫn lỗi: thử tắt VPN/proxy; hoặc chạy backend trong WSL nếu bạn dùng WSL.

- **MySQL cài trực tiếp trên máy:** Services → MySQL phải Running; `.env` có `DB_HOST=127.0.0.1`, `DB_PORT=3306`; firewall không chặn `127.0.0.1:3306`.

---

## WebSocket (Socket.IO)

Trading WebSocket dùng **Socket.IO**, namespace `trading`.

| Mục | Giá trị |
|-----|--------|
| **Base URL** | `http://localhost:3000` (hoặc `http://<IP>:3000` nếu chạy trên máy khác) |
| **Port** | `3000` (hoặc biến env `PORT` của backend) |
| **Namespace** | `trading` |
| **URL đầy đủ** | `http://localhost:3000` với namespace `/trading` (Socket.IO tự thêm path `/socket.io`) |

**Lỗi "The remote computer refused the network connection" (errno 1225) thường do:**

1. **Sai port** — App đang connect tới port khác (vd: 50179). Cấu hình lại base URL dùng **port 3000** (trùng với backend).
2. **Backend chưa chạy** — Chạy `npm run start:dev` trong thư mục backend, đảm bảo log có dòng `Server running on http://localhost:3000`.
3. **Android emulator** — Trong emulator, `localhost` là bản thân emulator. Dùng `http://10.0.2.2:3000` thay cho `http://localhost:3000`.
4. **Thiết bị thật / iOS simulator** — Dùng IP máy chạy backend (vd: `http://192.168.1.x:3000`), không dùng `localhost` từ máy/ simulator khác.

**Luồng kết nối:** Connect → gửi event `auth` với `{ token: "JWT..." }` → nhận `auth_response` → gửi `subscribe` với `{ pair_id, channels: ['ticker','ohlc'], interval: '1m' }` → nhận `ticker` và `ohlc`.

---

## Seed DB & tài khoản test

Chạy seed để nạp dữ liệu mẫu (currencies, users, market pairs, wallets):

```bash
npm run db:seed
```

**Tài khoản test (đăng nhập ngay sau khi seed):**

| Email | Password | Ghi chú |
|-------|----------|---------|
| admin@example.com | Admin@123! | Admin |
| trader1@example.com | Trader@123! | Trader 1 |
| trader2@example.com | Trader@123! | Trader 2 |
| trader3@example.com | Trader@123! | Trader 3 |

**Lưu ý:** Nếu FE/Postman nhận **401 Invalid credentials** khi login, cần chạy `npm run db:seed` trước (để tạo user trong DB). Backend so sánh mật khẩu bằng bcrypt; email không phân biệt hoa thường.
