# Claude Code — Kryptos Core Backend

**Workspace:** `be-cryptocurrency-trading-app/` (NestJS, TypeScript). **Chuẩn team BE.**

Ngữ cảnh session: `.claude/`. **Vibe Code / ECC:** [VIBE_CODE.md](../VIBE_CODE.md) · [AGENTS.md](../AGENTS.md) · [ECC-COMMANDS.md](../ECC-COMMANDS.md). Vận hành: [README.md](../README.md).

---

## Kiến trúc — Clean Architecture

Một số module đã áp dụng **Clean Architecture (Onion/Hexagonal)**:

```
domain/ # Ports (interfaces) — không phụ thuộc gì bên ngoài
 ├── ports/
 └── services/ # Domain services, invariants
application/ # Use-cases, queries, ports implementations (không phụ thuộc infrastructure)
 ├── use-cases/
 ├── queries/
 └── ports/ # TokenIssuerPort, PasswordHasherPort (trừu tượng, không có implementation)
infrastructure/ # Persistence adapters, external service adapters
 ├── persistence/ # *RepositoryImpl → implement port
 └── providers/ # JwtTokenIssuerAdapter, BcryptPasswordHasher → implement port
presentation/ # Controllers, DTOs (thường nằm ở root module)
```

**Module đã theo Clean Architecture:** `auth`, `orders`

**Module hybrid** (dùng `BaseRepository`, chưa tách đầy đủ): `wallets`, `users`, `markets`, `currencies`, `deposits`, `blockchain`, `treasury`, `matching`

---

## Quy tắc kiến trúc quan trọng

### Dependency Injection Token (Port Pattern)
Domain **không bao giờ** import trực tiếp implementation. Dùng Symbol token:

```typescript
// domain/ports — định nghĩa interface
export const TOKEN_ISSUER = Symbol('TOKEN_ISSUER');
export interface TokenIssuerPort { sign(payload: Record<string, unknown>): string; }

// infrastructure/providers — implementation
export class JwtTokenIssuerAdapter implements TokenIssuerPort { ... }

// application/use-cases — phụ thuộc port, không implementation
constructor(@Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuerPort) {}

// auth.module.ts — wire adapter với token
{ provide: TOKEN_ISSUER, useExisting: JwtTokenIssuerAdapter },
JwtTokenIssuerAdapter,
```

### TransactionContext — Opaque interface
Domain **không import EntityManager**. Dùng `TransactionContext` (empty interface):

```typescript
// src/common/types/transaction-context.ts
export interface TransactionContext {}
```

Infrastructure implementation cast về `EntityManager`:
```typescript
function toEntityManager(ctx: TransactionContext): EntityManager {
 return ctx as unknown as EntityManager;
}
```

**Files cần cập nhật khi thêm port mới:**
- `domain/ports/*.port.ts` — định nghĩa interface
- `infrastructure/persistence/*.impl.ts` — implement port, dùng `toEntityManager()`
- `application/use-cases/*.ts` — inject qua `@Inject(TOKEN)`
- `*.module.ts` — wire token → adapter

---

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
| Auth & RBAC | `src/modules/auth/` — Clean Architecture ✓ (`domain/`, `application/`, `infrastructure/`) |
| Thị trường & giá | `markets/`, `exchange/`, `price-oracle/`, `currencies/` |
| Lệnh & khớp | `orders/` — Clean Architecture ✓; **nhạy cảm**: Redis lock, STP, circuit breaker, audit log |
| Giao dịch realtime | `trading/` + WebSocket |
| Ví & số dư | `wallets/` |
| Blockchain / WC | `blockchain/` (kể cả `wallet-connect/`) |
| Nạp-rút / PayOS | `deposits/`, `payment-config/` |
| Treasury / vận hành | `treasury/`, `managed-wallets/` |
| MM batch | `market-maker/` |
| Queue / cache | `redis/`, Bull theo module |

Cấu trúc chi tiết: [README.md](../README.md).

## Đừng đụng / cẩn trọng

- **Không** commit `.env*`, khóa ví, RPC secrets, seed credential thật.
- **`matching/` + `orders/`**: mọi thay đổi luồng khớp cần test + mô tả rủi ro (Redis Lua lock, order book, `CircuitBreakerService`, `AuditTradeVisitor`, slippage…).
- **Migration & entity**: không xóa migration đã chạy; giữ đồng bộ DB.
- **Whitelist env**: biến mới → `src/config/env.validation.ts` (cả `EnvironmentVariables` class VÀ mảng `envVarKeys`).
- **UserRole**: chỉ giá trị trong `src/common/enums`.

## Frontend

App Flutter do **team FE** maintain — **repo Git riêng**; đổi API ở đây thì phối hợp contract / versioning với client.

## ECC — CCG / lệnh multi-agent

```bash
npx ccg-workflow
```

Chi tiết: [ECC-COMMANDS.md](../ECC-COMMANDS.md).
