# Claude Code — Kryptos Core Backend

**Workspace:** `be-cryptocurrency-trading-app/` (NestJS, TypeScript). **Chuan team BE.**

Thu muc `.claude/` la nguon chuan cua BE. Khi mo workspace la root monorepo, BE tu dong duoc nhan dien nhu subdirectory.

## Nguon chi

| File | Ghi chu |
|------|---------|
| `VIBE_CODE.md` | Chuẩn AI của team BE |
| `AGENTS.md` | Danh sach agent ECC cho BE |
| `ECC-COMMANDS.md` | Lệnh CCG / multi-agent |
| `docs/ARCHITECTURE.md` | Kiến trúc chi tiet |
| `README.md` | Setup, chạy local |

---

## Kien truc — Clean Architecture

Mot so module da ap dung **Clean Architecture (Onion/Hexagonal)**:

```
domain/ # Ports (interfaces) — khong phu thuoc gi ben ngoai
 ├── ports/
 └── services/ # Domain services, invariants
application/ # Use-cases, queries, ports implementations (khong phu thuoc infrastructure)
 ├── use-cases/
 ├── queries/
 └── ports/ # TokenIssuerPort, PasswordHasherPort (truu tuong, khong co implementation)
infrastructure/ # Persistence adapters, external service adapters
 ├── persistence/ # *RepositoryImpl → implement port
 └── providers/ # JwtTokenIssuerAdapter, BcryptPasswordHasher → implement port
presentation/ # Controllers, DTOs (thuong nam o root module)
```

**Clean Architecture day du (domain + application + infrastructure):** `auth`, `orders`.

**Hybrid** (ports/repository + thuong co `BaseRepository` / SP; mot so da co `application/queries` mong cho surface doc): `wallets`, `users`, `markets`, `currencies`, `deposits`, `blockchain`, `treasury`, `matching`, `system-config`, `exchange-rate`, `managed-wallets`, `notifications`, `payment-config`, `market-maker`, … va cac adapter **`trading`**, **`exchange`**, **`dashboard`**, **`binance-rest`**, **`price-oracle`**, **`metadata`** (logic tap trung service + query handlers doc, khong co domain nang).

**Toan cuc:** `src/common/outbox/` (outbox + Bull `outbox-relay` → `OutboxRelayService` / `OutboxIntegrationSyncService`), `src/common/unit-of-work/`, `src/common/application-bus/` (`@nestjs/cqrs`), read model `read_market_pairs` / `read_onchain_deposits`, env `READ_MARKETS_FROM_PROJECTION`, `READ_MODEL_ONCHAIN_DEPOSITS`. `npm run lint:boundaries`.

---

## Quy tac kien truc quan trọng

### Dependency Injection Token (Port Pattern)
Domain **khong bao gio** import truc tiep implementation. Dung Symbol token:

```typescript
// domain/ports — dinh nghia interface
export const TOKEN_ISSUER = Symbol('TOKEN_ISSUER');
export interface TokenIssuerPort { sign(payload: Record<string, unknown>): string; }

// infrastructure/providers — implementation
export class JwtTokenIssuerAdapter implements TokenIssuerPort { ... }

// application/use-cases — phu thuoc port, khong implementation
constructor(@Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuerPort) {}

// *.module.ts — wire adapter voi token
{ provide: TOKEN_ISSUER, useExisting: JwtTokenIssuerAdapter },
JwtTokenIssuerAdapter,
```

### TransactionContext — Opaque interface
Domain **khong import EntityManager**. Dung `TransactionContext` (empty interface):

```typescript
// src/common/types/transaction-context.ts
export interface TransactionContext {}
```

Infrastructure implementation cast ve `EntityManager`:
```typescript
function toEntityManager(ctx: TransactionContext): EntityManager {
 return ctx as unknown as EntityManager;
}
```

**Files can cap nhat khi them port moi:**
- `domain/ports/*.port.ts` — dinh nghia interface
- `infrastructure/persistence/*.impl.ts` — implement port, dung `toEntityManager()`
- `application/use-cases/*.ts` — inject qua `@Inject(TOKEN)`
- `*.module.ts` — wire token → adapter

---

## Chay local

```bash
# Tao .env.development tu .env.development.example, chinh DB_*, REDIS_*, JWT_*, …
npm run docker:infra:up
npm install
npm run migration:run
# npm run lint:boundaries  # tuy chon — truoc PR lon
npm run db:seed
npm run start:dev
```

| | URL |
|---|-----|
| API | `http://127.0.0.1:3000/api/v1` |
| Health | `GET /api/v1/health` |
| Swagger | `http://127.0.0.1:3000/api/docs` (thuong tat khi production) |

## Module / vung quan trọng

| Khu vuc | Thu muc / ghi chu |
|---------|-------------------|
| Auth & RBAC | `src/modules/auth/` — Clean Architecture ✓ (`domain/`, `application/`, `infrastructure/`) |
| Thi truong & gia | `markets/`, `exchange/`, `price-oracle/`, `currencies/` |
| Lenh & khop | `orders/` — Clean Architecture ✓; **nhay cam**: Redis lock, STP, circuit breaker, audit log |
| Giao dich realtime | `trading/` + WebSocket |
| Vi & so du | `wallets/` |
| Blockchain / WC | `blockchain/` (ke ca `wallet-connect/`) |
| Nap-rut / PayOS | `deposits/`, `payment-config/` |
| Treasury / van hanh | `treasury/`, `managed-wallets/` |
| MM batch | `market-maker/` |
| Queue / cache | `redis/`, Bull theo module; Bull Board: `/admin/queues` (admin-only) |

Cau truc chi tiet: `README.md`.

## Dong dont / can trong

- **Khong** commit `.env*`, khoa vi, RPC secrets, seed credential that.
- **`matching/` + `orders/`**: moi thay doi luong khop can test + mo ta rui ro (Redis Lua lock, order book, `CircuitBreakerService`, `AuditTradeVisitor`, slippage...).
- **Migration & entity**: khong xoa migration da chay; giu dong bo DB.
- **Whitelist env**: bien moi → `src/config/env.validation.ts` (ca `EnvironmentVariables` class VA mang `envVarKeys`).
- **UserRole**: chi gia tri trong `src/common/enums`.

## Frontend

App Flutter do **team FE** maintain — **repo Git rieng**; doi API o day thi phoi hop contract / versioning voi client.

## Chuan AI — Rules & Skills

| Muc | Duong dan | Ghi chu |
|-----|-----------|---------|
| Rules | `.cursor/rules/` | nestjs-api-design, nestjs-database, typescript-*, common-* |
| Skills | `.cursor/skills/` | nestjs-patterns, backend-patterns, api-design, postgres-patterns, database-migrations, security-review, tdd-workflow, verification-loop |

ECC commands (neu can):

```bash
npx ccg-workflow
```

Chi tiet: `ECC-COMMANDS.md`.
