# Contributing Rules — NestJS Backend Team

## Quick Reference

**Rule priority:** `typescript-*` → `nestjs-*` → `common-*`

**Stack:** NestJS/TypeScript only. Không tạo Flutter widget, Dart code, hay Playwright UI test trong repo này.

## Before You Code

1. Đọc [VIBE_CODE.md](./VIBE_CODE.md)
2. Kiểm tra module bạn sắp sửa trong [docs/security-zones.md](./docs/security-zones.md)
3. Nếu feature ảnh hưởng `matching/`, `orders/`, `wallets/`, `treasury/`, `blockchain/`: tạo `docs/risk-<feature>.md` trước
4. Dùng `/ecc:plan` trước khi implement

## Code Conventions

### Module Structure

**Full Clean Architecture** (áp dụng cho `auth`, `orders` — template dưới đây). Outbox relay + read model: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/ARCHITECTURE_FULL_ROLLOUT.md](./docs/ARCHITECTURE_FULL_ROLLOUT.md).

Cấu trúc thư mục tham chiếu:
```
src/modules/feature-name/
├── domain/
│ ├── ports/ # Interface — không import infrastructure
│ │ └── *.port.ts
│ └── services/ # Domain services, invariants
│ └── *.service.ts
├── application/
│ ├── use-cases/ # Business use-cases (phụ thuộc domain port)
│ │ └── *.use-case.ts
│ ├── queries/ # Read-only queries
│ │ └── *.query.ts
│ └── ports/ # Abstract port (interface only, no implementation)
│ └── *.port.ts
├── infrastructure/
│ ├── persistence/ # Repository implementations
│ │ └── *.repository.impl.ts
│ └── providers/ # External service adapters (JWT, password, etc.)
│ └── *.adapter.ts
├── dto/
│ ├── create-feature.dto.ts
│ ├── update-feature.dto.ts
│ └── feature-response.dto.ts
├── commands/ # Command objects (CQRS pattern)
│ └── *.command.ts
├── states/ # State machine (optional)
│ └── *.state.ts
├── feature.module.ts
├── feature.controller.ts # Thin — chỉ route + auth guard
├── feature.service.ts # Facade — orchestration layer
└── __tests__/
 ├── feature.service.spec.ts
 └── feature.controller.spec.ts
```

**Hybrid pattern** (hầu hết bounded context còn lại — ví dụ wallets, users, markets, matching, …):
```
src/modules/feature-name/
├── domain/
│ └── ports/ # Repository port interfaces (khi module đã tách port)
│ └── *.port.ts
├── application/        # tùy module — có thể chỉ có queries đọc mỏng
│ └── queries/
│ └── *.query.ts
├── dto/
│ └── *.dto.ts
├── infrastructure/
│ └── persistence/ # BaseRepository subclass + stored procedures
│ └── *.repository.impl.ts
├── feature.module.ts
├── feature.controller.ts
├── feature.service.ts
└── __tests__/
 └── *.spec.ts
```

Ghi chép outbox / transaction chung: [docs/DATA_ACCESS_PATTERNS.md](./docs/DATA_ACCESS_PATTERNS.md).

### Naming

| Loại | Convention | Ví dụ |
|------|-----------|--------|
| Classes | PascalCase | `OrdersService`, `CreateOrderDto` |
| Variables/functions | camelCase | `userId`, `createOrder()` |
| Constants | UPPER_SNAKE | `MAX_ORDER_RETRIES` |
| Files | kebab-case | `orders.service.ts`, `create-order.dto.ts` |
| Test files | `*.spec.ts` | `orders.service.spec.ts` |

### TypeScript

```typescript
// ✓ Explicit return types
async createOrder(userId: string, dto: CreateOrderDto): Promise<Order> {}

// ✓ Enums từ common/enums
import { OrderStatus, UserRole } from '@/common/enums';

// ✓ Immutable patterns — không mutate object nhận vào
const updatedOrder = { ...order, status: OrderStatus.FILLED };

// ✗ Không dùng any
const data: any = ...; // BAD
```

## Testing Requirements

- Coverage minimum: **80%** (critical modules: **100%**)
- Mọi service method phải có unit test
- API endpoints phải có integration test (supertest)
- Database operations: integration test với test DB

```bash
npm test                    # Tất cả tests (Jest)
npx jest --coverage         # Với coverage report
npx jest --testPathPattern=orders # Chỉ orders module
```

## Lint & Quality gates

- **Biome** là tool lint/format duy nhất (`biome.json`):
  - `npm run lint` — `biome lint ./src ./scripts`
  - `npm run lint:fix` — `biome check --write ./src ./scripts`
  - `npm run format` / `format:check`
- **Module boundary guard:** `npm run lint:boundaries` (`scripts/check-module-boundaries.mjs`) — chặn `modules/A` import `modules/B/application/**`.
- **UoW policy guard:** `npm run lint:uow` (`scripts/check-uow-policy.mjs`) — chặn `dataSource.transaction` trực tiếp ngoài repository.
- **Type check:** `npx tsc --noEmit`.
- **Coverage:** `npm run test:cov` — phải ≥ 80%.

## Database/Migration Rules

- **Không** xóa migration đã chạy
- **Không** add NOT NULL column vào bảng có data mà không backfill
- **Không** rename column trực tiếp — add → copy → drop
- Mọi migration phải có `up()` và `down()` hoạt động được

## API Design Rules

- Versioning: `/api/v1/resource`
- Mọi endpoint phải có `@ApiOperation` + `@ApiResponse` (Swagger)
- Response format: `{ success: true, data: T }` hoặc `{ success: false, error: string }`
- Pagination: dùng `PaginationQueryDto`, trả về `meta.total`, `meta.page`, `meta.limit`

## Git Workflow

```bash
# Branch naming
feature/add-withdrawal-webhook
fix/order-status-race-condition
chore/upgrade-nestjs-10

# Commit format
feat: add PayOS withdrawal webhook handler
fix: resolve order status race condition with optimistic locking
test: add integration tests for matching service
```

## PR Requirements

- Title: `<type>: <description>` (< 72 chars)
- Body: copy checklist từ `docs/onboarding/ecc-commands-quick-ref.md`
- CRITICAL module changes: minimum 2 reviewers
- Other changes: minimum 1 reviewer
- CI phải pass (lint + tsc + tests)
- Không deploy CRITICAL module changes ngoài giờ hành chính

## Security Requirements

Đọc [docs/security-zones.md](./docs/security-zones.md). Không commit:
- `.env*` files thật
- Private keys, hot wallet credentials
- JWT secrets
- Database passwords
- RPC endpoint URLs với API keys

Hook `before-submit-prompt.js` sẽ warning khi prompt chứa secrets và khi mention sensitive zone.
