# Kryptos Core — Backend API

API backend cho nền tảng giao dịch tiền mã hóa (**NestJS**). Base path: **`/api/v1`**.

## Tính năng (tổng quan)

- Đăng ký / đăng nhập, JWT, phân quyền theo vai trò, 2FA qua email  
- Thị trường, lệnh, khớp lệnh, ví nội bộ và đồng bộ sàn (theo cấu hình)  
- Nạp/rút (fiat qua PayOS, on-chain theo chain đã cấu hình)  
- Liên kết ví & WalletConnect  
- Kho bạc (treasury), thông báo push (Firebase), realtime WebSocket  

Chi tiết luồng nghiệp vụ, Redis, migration đặc biệt, v.v. nằm trong thư mục [`docs/`](docs/).

## Yêu cầu

- **Node.js** (khuyến nghị LTS 20+) và npm  
- **MySQL 8** và **Redis 7** (có thể dùng Docker — xem bước dưới)

## Chạy local

### 1. Biến môi trường

- Mỗi môi trường một file: **`.env.development`**, **`.env.staging`**, **`.env.production`** (cùng thư mục gốc backend). Tạo từ bản mẫu tương ứng: `.env.development.example`, `.env.staging.example`, `.env.production.example`.  
- App Nest và CLI (migration, seed) chỉ đọc **`.env.${NODE_ENV}`**. Scripts npm đặt `NODE_ENV` qua `cross-env`; nếu chạy thủ công mà thiếu `NODE_ENV`, mặc định file env là **`.env.development`**.  
- Không commit file chứa secret thật.

### 2. MySQL + Redis

Dùng **cùng file env** với app cho dev (`.env.development` — `DB_*` / `REDIS_*` khớp Compose):

```bash
npm run docker:infra:up
```

Tuỳ chọn: `npm run docker:infra:down` (tắt), `npm run docker:infra:logs` (log). Nếu gọi Docker trực tiếp, Compose **không** tự đọc `.env.development`; cần `--env-file .env.development` (hoặc shell đã export đủ biến).

### 3. Cài đặt, migration, seed, chạy dev

```bash
npm install
npm run migration:run
npm run db:seed
npm run start:dev
```

`start:dev` / `dev` đặt **`NODE_ENV=development`** (qua `cross-env`). Các lệnh khác:

| Script | Ý nghĩa ngắn |
|--------|----------------|
| `npm run start` | Chạy một lần, `NODE_ENV=development` |
| `npm run start:debug` | Dev + debugger |
| `npm run dev:staging` / `start:staging` | `NODE_ENV=staging` |
| `npm run start:prod` | Production (cần `npm run build` trước) |
| `npm run migration:run` / `migration:revert` / `migration:show` | TypeORM migrations |
| `npm run db:seed` / `db:clean` | Seed / dọn dữ liệu seed |
| `npm run docker:infra:up` / `docker:infra:down` | MySQL + Redis (Compose, `--env-file .env.development`) |
| `npm run test` | Jest |

Production: `npm run build` rồi `npm run start:prod`.

## Kiểm tra nhanh

| | URL |
|---|-----|
| API | `http://127.0.0.1:3000/api/v1` |
| Health | `GET http://127.0.0.1:3000/api/v1/health` |
| Swagger | `http://127.0.0.1:3000/api/docs` (thường tắt khi `NODE_ENV=production`) |

## Tài khoản demo sau seed

Seed dùng `src/seed/data/users.json` nếu có; không thì dùng `users.json.example` (copy thành `users.json` và đổi mật khẩu ngoài môi trường dev). Có thể trỏ `SEED_USERS_JSON` sang file khác.

| Email (mẫu) | Mật khẩu (mẫu) | Vai trò |
|-------------|----------------|---------|
| admin@example.com | ChangeMeAdmin! | ADMIN |
| trader1@example.com | ChangeMeTrader! | TRADER |
| trader2@example.com | ChangeMeTrader! | TRADER |
| risk@example.com | ChangeMeRisk! | RISK_OFFICER |
| support@example.com | ChangeMeSupport! | SUPPORT_AGENT |
| maker@example.com | ChangeMeMaker! | MARKET_MAKER |
| finance@example.com | ChangeMeFinance! | FINANCE_MANAGER |
