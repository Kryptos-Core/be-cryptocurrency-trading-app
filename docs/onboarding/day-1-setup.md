# Onboarding NestJS Backend — Ngày 1

## 1. Prerequisites

```bash
# Kiểm tra versions
node --version # >= 18.x
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
# Điền DB_*, REDIS_*, JWT_*, ... — hỏi Tech Lead

# Khởi động infrastructure (MySQL + Redis)
docker compose -f docker-compose.infrastructure.yml --env-file .env.development up -d

# Kiểm tra containers
docker compose -f docker-compose.infrastructure.yml ps

# Cài dependencies
npm install

# Chạy migrations
npm run migration:run

# (Tùy chọn) Kiểm tra ranh giới import giữa các module — CI / trước PR lớn
npm run lint:boundaries

# Seed data (optional, dev only)
npm run db:seed

# Khởi động server
npm run start:dev
```

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
├── modules/ # 23 bounded contexts
│ ├── auth/ # ✓ Clean Architecture: domain/, application/, infrastructure/
│ ├── orders/ # ✓ Clean Architecture + CQRS (use-cases, queries, commands)
│ ├── matching/ # ⚠ SENSITIVE — đọc VIBE_CODE.md trước khi sửa
│ ├── wallets/ # Hybrid: BaseRepository + stored procedures
│ ├── users/ # Hybrid
│ └── ...
├── common/
│ ├── application-bus/ # @nestjs/cqrs — ApplicationBusModule
│ ├── outbox/ # transactional outbox + Bull relay
│ ├── unit-of-work/ # UnitOfWork — transaction bọc ghi + outbox
│ ├── read-model/ # projector / handler read side (pilot)
│ ├── repositories/ # BaseRepository
│ ├── services/ # RedisService, CloudinaryService, MailService, …
│ ├── types/ # TransactionContext (opaque interface)
│ └── utils/ # Pagination helpers
├── config/ # Env validation (thêm biến mới vào env.validation.ts)
├── migrations/ # TypeORM migrations (KHÔNG xóa migration đã chạy)
└── entities/ # Shared database entities (typed relations ✓)
```

### Clean Architecture — module tham chiếu

- **auth**: `domain/ports/`, `application/use-cases/`, `infrastructure/providers/` (JwtTokenIssuerAdapter)
- **orders**: `domain/ports/`, `application/use-cases/`, `application/queries/`, `infrastructure/persistence/` (OrderRepositoryImpl); có aggregate pilot trong `domain/aggregates/`
- **markets**: ghi có thể đi qua **UoW + outbox**; đọc list có thể dùng **read projection** khi bật `READ_MARKETS_FROM_PROJECTION` — xem [ARCHITECTURE.md](../ARCHITECTURE.md)

**Port Pattern:** Domain định nghĩa interface (ví dụ `TokenIssuerPort`). Infrastructure cung cấp implementation (`JwtTokenIssuerAdapter`). Use-case inject qua Symbol token (`TOKEN_ISSUER`). Không bao giờ import implementation trực tiếp vào domain.

**TransactionContext:** Domain dùng `TransactionContext` thay vì `EntityManager`. Infrastructure cast về `EntityManager` qua `toEntityManager()`. Xem: [docs/DATA_ACCESS_PATTERNS.md](../DATA_ACCESS_PATTERNS.md), [docs/ARCHITECTURE.md](../ARCHITECTURE.md) (UoW + outbox).

## 6. Module quan trọng cần đọc đầu tiên

Trước khi code, đọc:
- [VIBE_CODE.md](../../VIBE_CODE.md) — quy trình AI coding của team
- [README.md](../../README.md) — full setup + module docs
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — outbox, bus, read model pilot
- `.cursor/rules/nestjs-sensitive-zones.md` — modules cực nhạy cảm

## 7. Task đầu tiên

Good First Issues cho BE dev mới:
- Thêm field vào DTO (không đụng matching/orders core)
- Viết unit test cho service có sẵn
- Tạo endpoint read-only mới với swagger docs
