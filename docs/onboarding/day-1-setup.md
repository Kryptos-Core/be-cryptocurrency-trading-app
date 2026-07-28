# Onboarding NestJS Backend — Ngày 1

> Last reviewed: 2026-07-28 — verified against `package.json`, `docker-compose.infrastructure.yml`, `src/modules/`.

## 1. Prerequisites

```bash
# Kiểm tra versions
node --version # >= 20.x
npm --version
docker --version
docker compose version
```

## 2. Clone và Setup

```bash
git clone <be-repo-url>
cd be-cryptocurrency-trading-app

# Tạo .env từ template development
cp .env.development.example .env.development
# Điền CORE_DB_*, REDIS_*, JWT_SECRET, REOWN_PROJECT_ID, SEED_DATA_ENCRYPTION_KEY, … — hỏi Tech Lead.

# Khởi động infrastructure (PostgreSQL + Redis; :up:full = + Kafka + ClickHouse + TimescaleDB)
npm run docker:infra:up

# Kiểm tra containers
npm run docker:infra:health

# Cài dependencies
npm install

# Chạy migrations (TypeORM)
npm run db:migrate

# (Tùy chọn) Kiểm tra ranh giới import giữa các module — CI / trước PR lớn
npm run lint:boundaries
npm run lint:uow

# Seed data (optional, dev only)
npm run db:seed

# Khởi động server (dev mode watch)
npm run dev
```

> Script dev là `npm run dev` (Nest start --watch). Không còn `start:dev` / `migration:run` — xem `package.json` để biết đầy đủ (`db:migrate`, `db:migrate:revert`, `db:seed`, `seed:encrypt`, …).

## 3. Verify Setup

```bash
# Health check
curl http://127.0.0.1:3000/api/v1/health
# Expected: {"status":"ok"}

# Swagger docs
# Mở trình duyệt: http://127.0.0.1:3000/api/docs
```

## 4. Cài IDE

### Cursor (Khuyến nghị)

1. `File → Open Folder` → `be-cryptocurrency-trading-app/` (cùng cấp `package.json`)
2. Cursor tự load `.cursor/rules/` với NestJS/TypeScript rules
3. Extensions: TypeScript, Prettier (đã có config trong `biome.json`)

### Claude Code (CLI)

```bash
npm install -g @anthropic-ai/claude-code
cd be-cryptocurrency-trading-app
claude # Đọc .claude/CLAUDE.md tự động
```

## 5. Cấu trúc Dự án

```
src/
├── modules/ # 24+ bounded contexts (auth, orders, matching, wallets, treasury,
│ #  blockchain, deposits, payment-config, managed-wallets, market-maker,
│ #  currencies, exchange-rate, system-config, metadata, dashboard,
│ #  user-binance-credentials, treasury-e2e-config, notifications, users,
│ #  binance-rest, binance-proxy, price-oracle, redis, exchange, markets, trading)
│ ├── auth/ # ✓ Clean Architecture: domain/, application/, infrastructure/
│ ├── orders/ # ✓ Clean Architecture + CQRS (use-cases, queries, commands)
│ ├── matching/ # ⚠ SENSITIVE — đọc VIBE_CODE.md trước khi sửa
│ ├── wallets/ # Hybrid: BaseRepository + transactional PostgreSQL repositories
│ ├── users/ # Hybrid
│ ├── user-binance-credentials/ # AES-256-GCM credential storage (mirror FE binance_trading)
│ ├── treasury/ # ⚠ SENSITIVE
│ ├── blockchain/ # Linked wallets, on-chain deposits (UoW + outbox)
│ ├── payment-config/ # Active payment method configs (PayOS)
│ ├── system-config/ # Runtime config từ DB → Redis → .env (UI Admin Platform)
│ ├── managed-wallets/ # Deposit UI hot wallets
│ └── ...
├── common/
│ ├── application-bus/ # @nestjs/cqrs — ApplicationBusModule
│ ├── outbox/ # outbox + Bull relay → OutboxIntegrationSyncService (sync read model)
│ ├── unit-of-work/ # UnitOfWork — transaction bọc ghi + outbox
│ ├── read-model/ # applier read model (markets, on-chain deposits)
│ ├── repositories/ # BaseRepository
│ ├── services/ # RedisService, CloudinaryService, MailService, …
│ ├── integration-events/ # event catalog (`integration-event-catalog.ts`)
│ ├── types/ # TransactionContext (opaque interface)
│ └── utils/ # Pagination, base-units helpers
├── config/ # Env validation (thêm biến mới vào env.validation.ts)
├── migrations/ # TypeORM migrations (KHÔNG xóa migration đã chạy)
└── entities/ # Shared database entities (typed relations ✓)
```

### Clean Architecture — module tham chiếu

- **auth**: `domain/ports/`, `application/use-cases/`, `infrastructure/providers/` (JwtTokenIssuerAdapter)
- **orders**: `domain/ports/`, `application/use-cases/`, `application/queries/`, `infrastructure/persistence/` (OrderRepositoryImpl); có aggregate pilot trong `domain/aggregates/`
- **markets**: UoW + outbox; đọc list có thể từ **`read_market_pairs`** (`READ_MARKETS_FROM_PROJECTION`). **blockchain** (deposit): **`read_onchain_deposits`** (`READ_MODEL_ONCHAIN_DEPOSITS`) — [ARCHITECTURE.md](../ARCHITECTURE.md), [ARCHITECTURE_FULL_ROLLOUT.md](../ARCHITECTURE_FULL_ROLLOUT.md)

**Port Pattern:** Domain định nghĩa interface (ví dụ `TokenIssuerPort`). Infrastructure cung cấp implementation (`JwtTokenIssuerAdapter`). Use-case inject qua Symbol token (`TOKEN_ISSUER`). Không bao giờ import implementation trực tiếp vào domain.

**TransactionContext:** Domain dùng `TransactionContext` thay vì `EntityManager`. Infrastructure cast về `EntityManager` qua `toEntityManager()`. Xem: [docs/DATA_ACCESS_PATTERNS.md](../DATA_ACCESS_PATTERNS.md), [docs/ARCHITECTURE.md](../ARCHITECTURE.md) (UoW + outbox).

## 6. Module quan trọng cần đọc đầu tiên

Trước khi code, đọc:
- [VIBE_CODE.md](../../VIBE_CODE.md) — quy trình AI coding của team
- [README.md](../../README.md) — full setup + module docs
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — outbox relay, bus, read model
- [docs/ARCHITECTURE_FULL_ROLLOUT.md](../ARCHITECTURE_FULL_ROLLOUT.md) — relay semantics, on-chain read model
- `.cursor/rules/nestjs-sensitive-zones.md` — modules cực nhạy cảm

## 7. Task đầu tiên

Good First Issues cho BE dev mới:
- Thêm field vào DTO (không đụng matching/orders core)
- Viết unit test cho service có sẵn
- Tạo endpoint read-only mới với swagger docs
