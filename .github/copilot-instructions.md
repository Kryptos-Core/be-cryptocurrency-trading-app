You are an AI coding assistant for the cryptocurrency trading app NestJS backend.

## Project Context

This is a NestJS/TypeScript REST API + WebSocket server for cryptocurrency trading. It uses TypeORM + MySQL, Redis (Bull queues + Lua locks), and integrates with Solana, Ethereum, and TRON blockchains.

**Tech Stack:** NestJS 10, TypeScript 5, TypeORM 0.3, MySQL 8, Redis 7, Bull queues, Passport JWT, WalletConnect, PayOS

**Structure:** `src/modules/` — 23 bounded contexts. Critical modules require special process (see below).

## Conventions to Follow

1. **Module Structure**: Controller (thin) → Service (business logic) → Repository (data access)
2. **Immutability**: Return new objects, never mutate entity objects received as parameters
3. **Error handling**: Use NestJS built-in HTTP exceptions. Log details internally, return generic messages to client.
4. **DTOs**: Every endpoint must have request DTO with `class-validator` decorators and response DTO with `@Expose()`
5. **Auth**: Every non-public endpoint must have `@UseGuards(JwtAuthGuard, RolesGuard)`
6. **Testing**: Services and controllers must have unit tests. Endpoints must have supertest integration tests. Min 80%.

## API Design

- Base path: `/api/v1/`
- Every endpoint needs `@ApiOperation()` + `@ApiResponse()` for Swagger
- Response format: `{ success: true, data: T }` or `{ success: false, error: string }`
- Pagination: use `PaginationQueryDto`, return `meta: { total, page, limit, totalPages }`

## Database Rules

- Use `uuid` primary keys (never auto-increment int)
- Financial values: `decimal(20, 8)` stored as `string` (never `number` for money)
- Always include `@CreateDateColumn()` and `@UpdateDateColumn()`
- Index columns used in WHERE clauses: `@Index()`
- Migrations: NEVER delete a migration that has run. NEVER add NOT NULL column without backfill.

## CRITICAL: Sensitive Modules

The following modules handle financial transactions and REQUIRE special care:

- `matching/` — Matching engine with Redis Lua locks, STP, circuit breaker, audit trail
- `orders/` — Order lifecycle and balance reservation  
- `wallets/` — User balances (available/reserved/locked invariant must be maintained)
- `treasury/` — Hot wallet management
- `blockchain/` — Blockchain calls, private key operations

**For any change to these modules:**
1. Create `docs/risk-<feature>.md` with risk assessment
2. Write 100% test coverage for business logic paths
3. Require 2 reviewers (Tech Lead + Senior)
4. Only deploy during business hours (9am-5pm GMT+7)

## Security Rules

- **NEVER** log private keys, seed phrases, or raw signed transactions
- **NEVER** hardcode secrets (DB passwords, JWT secret, API keys) — use ConfigService
- **ALWAYS** register new env vars in `src/config/env.validation.ts`
- **ALWAYS** use UserRole from `src/common/enums` — no custom role strings
- **Redis locks** must use atomic Lua scripts, never `SETNX` + `EXPIRE` separately

## Code Style

```typescript
// Service: explicit return types
async createOrder(userId: string, dto: CreateOrderDto): Promise<Order> {
  return this.dataSource.transaction(async (manager) => {
    // transactional operations
  });
}

// DTO: always validate
export class CreateOrderDto {
  @IsEnum(OrderSide)
  @ApiProperty({ enum: OrderSide })
  side: OrderSide;

  @IsPositive()
  @IsNumber({ maxDecimalPlaces: 8 })
  @ApiProperty()
  quantity: number;
}
```

## What NOT to Do

- Do not add Flutter/Dart code to this repo
- Do not use `console.log` — use NestJS `Logger`
- Do not skip `@UseGuards(JwtAuthGuard)` on private endpoints
- Do not run migrations in code — use `npm run migration:run`
- Do not delete any migration file

## Quality Gates

Before marking complete:
1. `npm run lint` passes
2. `npx tsc --noEmit` passes (no TypeScript errors)  
3. `npm test` passes with >= 80% coverage
4. No `console.log` in non-test code
5. No hardcoded secrets
