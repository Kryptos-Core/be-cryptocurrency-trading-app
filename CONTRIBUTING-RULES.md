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

```
src/modules/feature-name/
├── feature.module.ts
├── feature.controller.ts       # Thin — chỉ route + auth guard
├── feature.service.ts          # Business logic
├── feature.repository.ts       # Data access
├── dto/
│   ├── create-feature.dto.ts
│   ├── update-feature.dto.ts
│   └── feature-response.dto.ts
└── __tests__/
    ├── feature.service.spec.ts
    └── feature.controller.spec.ts
```

### Naming

| Loại | Convention | Ví dụ |
|------|-----------|-------|
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
import { OrderStatus, UserRole } from '../../common/enums';

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
npm test                      # Tất cả tests
npx jest --coverage           # Với coverage report
npx jest --testPathPattern=orders  # Chỉ orders module
```

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
