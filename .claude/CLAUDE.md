# Claude Code — NestJS backend

**Workspace:** mở **root repo backend** (folder có `package.json` Nest) — chuẩn team BE; không cần mở monorepo cha.

Ngữ cảnh session: `.claude/`. **Vibe Code / ECC:** [VIBE_CODE.md](../VIBE_CODE.md) · [AGENTS.md](../AGENTS.md) · [ECC-COMMANDS.md](../ECC-COMMANDS.md). Vận hành: [README.md](../README.md).

## Chạy local (tóm tắt)

```bash
# Tạo .env.development từ .env.development.example, chỉnh DB_*, REDIS_*, JWT_*, …
npm run docker:infra:up
npm install
npm run migration:run
npm run db:seed
npm run start:dev
```

| | URL |
|---|-----|
| API | `http://127.0.0.1:3000/api/v1` |
| Health | `GET /api/v1/health` |
| Swagger | `http://127.0.0.1:3000/api/docs` (thường tắt khi production) |

## Module / vùng quan trọng

| Khu vực | Thư mục / ghi chú |
|--------|-------------------|
| Auth & RBAC | `src/modules/auth/`, `src/common/` (guards, RBAC) |
| Thị trường & giá | `markets/`, `exchange/`, `price-oracle/`, `currencies/` |
| Lệnh & khớp | `orders/`, `matching/` — **nhạy cảm**, Redis lock, STP, circuit breaker, audit log |
| Giao dịch realtime | `trading/` + WebSocket |
| Ví & số dư | `wallets/` |
| Blockchain / WC | `blockchain/` (kể cả `wallet-connect/`) |
| Nạp-rút / PayOS | `deposits/`, `payment-config/` |
| Treasury / vận hành | `treasury/`, `managed-wallets/` |
| MM batch | `market-maker/` |
| Queue / cache | `redis/`, Bull theo module |

Cấu trúc đầy đủ: README, mục cấu trúc thư mục.

## Đừng đụng / cẩn trọng

- **Không** commit `.env*`, khóa ví, RPC secrets, seed credential thật.
- **`matching/` + `orders/`**: mọi thay đổi luồng khớp cần test + mô tả rủi ro (Redis Lua lock, order book, `CircuitBreakerService`, `AuditTradeVisitor`, slippage…).
- **Migration & entity**: không xóa migration đã chạy; giữ đồng bộ DB.
- **Whitelist env**: biến mới → `src/config/env.validation.ts`.
- **UserRole**: chỉ giá trị trong `src/common/enums`.

## Frontend

App Flutter do **team FE** maintain — **repo Git riêng**; đổi API ở đây thì phối hợp contract / versioning với client.

## ECC — CCG / lệnh multi-agent

```bash
npx ccg-workflow
```

Chi tiết: [ECC-COMMANDS.md](../ECC-COMMANDS.md).
