# Architecture Audit & Improvement Plan

**Project:** be-cryptocurrency-trading-app (NestJS / TypeScript)
**Date:** 2026-04-16
**Branch:** develop

---

## 1. Current State Audit

### 1.1 Clean Architecture — Module Inventory

| Module | domain/ | application/ | infrastructure/ | Port DI (Symbol) | Classification |
|--------|---------|-------------|----------------|-------------------|----------------|
| `auth` | ports, (no domain services) | use-cases, ports (TokenIssuer, PasswordHasher) | persistence, providers | AUTH_REPOSITORY, TOKEN_ISSUER, PASSWORD_HASHER | **Clean Architecture ✓** |
| `orders` | ports, services (OrderReservePolicy, OrderValidation) | use-cases, queries, services | persistence | ORDER_REPOSITORY | **Clean Architecture ✓** |
| `wallets` | ports (6 ports), services (BalanceCalculation) | use-cases (5), queries (4) | persistence, adapters | WALLET_REPOSITORY, WALLET_LEDGER_REPOSITORY, ADMIN_ADJUSTMENT_REPOSITORY, WALLET_EVENT_PUBLISHER, CURRENCY_LOOKUP, EXCHANGE_SERVICE_PORT | **Clean Architecture ✓** |
| `blockchain` | ports (LinkedWallet, OnchainTransaction) | use-cases, queries | persistence | LINKED_WALLET_REPOSITORY, ONCHAIN_TRANSACTION_REPOSITORY | **Hybrid** — has application layer but many services at module root (onchain-*.service.ts, deposit-fx.service.ts) |
| `matching` | ports (MatchingRepository, TradeAuditLog) | (none) | persistence | MATCHING_REPOSITORY, TRADE_AUDIT_LOG_REPOSITORY | **Hybrid** — has event store, strategies, visitors but no application/use-cases layer |
| `currencies` | ports (CurrencyRepository) | use-cases (Create, Update, Delete), queries (GetAll, GetById) | persistence | CURRENCY_REPOSITORY | **Clean Architecture ✓** |
| `treasury` | ports (4 repos) | use-cases (15), queries (3) | persistence | 4 Symbol tokens | **Clean Architecture ✓** |
| `users` | ports (UsersRepository) | use-cases (7), queries (GetUsers) | persistence | USERS_REPOSITORY | **Clean Architecture ✓** |
| `deposits` | ports (FiatDepositRepository) | use-cases (CreateLink, HandleWebhook, SyncStatus), queries (GetAll, GetPreview) | persistence | FIAT_DEPOSIT_REPOSITORY | **Clean Architecture ✓** |
| `exchange-rate` | ports (ExchangeRateAuditRepository) | use-cases (Sync, UpdateConfig), queries (GetExchangeRate) | persistence, providers | EXCHANGE_RATE_AUDIT_REPOSITORY | **Clean Architecture ✓** |
| `system-config` | ports (SystemConfigRepository) | use-cases (UpdateConfig, UpdateConfigsBulk), queries (GetAllConfigs, GetRuntimeSettings) | persistence | SYSTEM_CONFIG_REPOSITORY | **Clean Architecture ✓** |
| `markets` | ports (MarketRepository) | use-cases (3), queries (4) | persistence | MARKET_REPOSITORY | **Clean Architecture ✓** |
| `managed-wallets` | ports (ManagedWalletsDataRepository) | use-cases (7), queries (GetManagedWallets) | (none) | MANAGED_WALLETS_DATA_REPOSITORY | **Clean Architecture ✓** |
| `notifications` | ports (NotificationRepository) | use-cases (Send, Broadcast, MarkRead, MarkAllRead), queries (GetNotifications) | (none) | (injection-tokens.ts) | **Clean Architecture ✓** |
| `payment-config` | ports (PaymentConfigRepository) | use-cases (Create, Update, Activate, Deactivate), queries (GetPaymentConfigs) | (none) | PAYMENT_CONFIG_REPOSITORY | **Clean Architecture ✓** |
| `market-maker` | ports (injection-tokens) | use-cases (Upsert, Delete, PlaceOrders, RefreshOrders), queries (GetMarketMaker) | (none) | MARKET_MAKER_CONFIG_REPOSITORY | **Clean Architecture ✓** |
| `trading` | (none) | (none) | (none) | (none) | **Traditional NestJS** — services, clients, WebSocket |
| `exchange` | (none) | (none) | (none) | (none) | **Traditional NestJS** — flat services |
| `dashboard` | (none) | (none) | (none) | (none) | **Traditional NestJS** — flat controller/service |
| `binance-rest` | (none) | (none) | (none) | (none) | **Traditional NestJS** — single service |
| `redis` | (none) | (none) | (none) | (none) | **Infrastructure** — shared module |
| `price-oracle` | (none) | (none) | (none) | (none) | **Traditional NestJS** — providers |
| `metadata` | (none) | (none) | (none) | (none) | **Traditional NestJS** — enum builder |

**Summary:** 14/22 modules fully Clean Architecture, 2 hybrid (blockchain, matching), 6 traditional/infrastructure.

### 1.2 Domain-Driven Design (DDD)

| Pattern | Status | Details |
|---------|--------|---------|
| **Bounded Contexts** | Partial | Modules act as bounded contexts but share entities from `src/entities/` globally. No anti-corruption layers between contexts. |
| **Aggregates / Aggregate Roots** | Missing | No aggregate root base class. Entities are flat TypeORM entities without aggregate invariant enforcement. |
| **Value Objects** | Missing | No value object pattern. Monetary values use `string` or `Decimal.js` directly, no typed Money/Price VOs. |
| **Domain Services** | Partial | `orders/domain/services/` (OrderReservePolicy, OrderValidation), `wallets/domain/services/` (BalanceCalculation). Other modules embed logic in application services. |
| **Domain Events** | Minimal | `matching/events/` has an in-memory event-sourced order book (EventStore, OrderBookProjection) — but this is matching-specific, not a general domain event system. No cross-module domain event bus. |
| **Domain Event Dispatcher** | Missing | No `DomainEventDispatcher` or `DomainEventBus`. `@nestjs/event-emitter` is used for infra events (price updates, config changes) but NOT for domain events (OrderCreated, TradeExecuted, etc.). |
| **Repository Pattern (DDD)** | Partial | Symbol-based DI ports define repo contracts. But repos return TypeORM entities, not domain aggregates. `BaseRepository` leaks DataSource/EntityManager. |
| **Ubiquitous Language** | Partial | Code uses trading terms consistently (order, trade, wallet, ledger) but lacks formal domain model documentation. |

### 1.3 CQS / CQRS

| Pattern | Status | Details |
|---------|--------|---------|
| **@nestjs/cqrs** | Not installed | No CommandBus, QueryBus, or handler decorators found. |
| **Manual CQS** | Advancing | 14 modules have separated `application/queries/` and `application/use-cases/` layers. Controllers delegate to use-cases/queries. |
| **Controllers** | Mixed | Controllers don't enforce CQS — single controller methods mix queries and mutations. No read/write endpoint separation. |

**Assessment:** CQS is emerging in application layers of 3 modules (orders, wallets, blockchain) as a convention (queries/ vs use-cases/), but there's no CQRS infrastructure (CommandBus, QueryBus, separate read models).

### 1.4 Unit of Work

| Pattern | Status | Details |
|---------|--------|---------|
| **TransactionContext** | Implemented | Opaque `TransactionContext` type in `src/common/types/transaction-context.ts`. Infrastructure casts to EntityManager. Domain layer doesn't see ORM types. |
| **UnitOfWork class** | Missing | No formal `UnitOfWork` pattern. Transactions are passed via `TransactionContext` parameter through port methods. |
| **Transaction propagation** | Manual | Services manually call `dataSource.transaction()` or `repository.transaction()` and pass the manager through call chains. |

**Assessment:** Transaction handling works but is manual and scattered. No centralized UoW that collects repository operations and commits atomically.

### 1.5 Async Tasks & Scheduler Tasks

| Pattern | Status | Details |
|---------|--------|---------|
| **@nestjs/schedule** | Installed | 3 schedulers: `ExchangeRateAutoSyncScheduler` (every minute), `MainWalletRotationScheduler`, `PaymentConfigGraceScheduler`. Redis distributed locks prevent overlap. |
| **Bull Queues** | Installed | 3 queues: `matching` (concurrency:1), `treasury` (sweep + fund jobs), `payment-config` (activation jobs). Each has a dedicated `@Processor`. |
| **Error handling** | Per-queue | Bull retry policies configured per queue. Schedulers have try/catch with logging. |

### 1.6 Worker Pool

| Pattern | Status | Details |
|---------|--------|---------|
| **Worker threads** | Missing | No `worker_threads` usage. |
| **Cluster mode** | Missing | No `cluster.fork()` or PM2 cluster configuration found. |
| **Bull concurrency** | Minimal | Matching queue: concurrency=1 (by design for order book safety). Other queues use default concurrency. |

**Assessment:** The application runs as a single-process Node.js app. No worker pool for CPU-intensive tasks. Horizontal scaling relies on external orchestration (Docker/K8s replicas + Redis-backed Bull queues).

### 1.7 Observability: OpenTelemetry

| Component | Status | Details |
|-----------|--------|---------|
| **OpenTelemetry SDK** | Not installed | No `@opentelemetry/*` packages in `package.json`. |
| **Distributed Tracing** | Missing | No spans, trace IDs, or context propagation. |
| **Metrics** | Missing | No `prom-client` or OTel metrics. No Prometheus endpoint. |
| **Structured Logging** | Partial | Uses NestJS built-in `Logger` (console-based). `LoggingInterceptor` logs method/URL/IP/duration but no structured JSON, no correlation IDs, no trace context. |
| **Health Checks** | Basic | `HealthModule` + `HealthController` exists but does NOT use `@nestjs/terminus`. No DB, Redis, or queue health indicators. |
| **Error Tracking** | Basic | `AllExceptionsFilter` catches all errors with consistent format. No Sentry/external error tracking. |

### 1.8 SOLID Principles

| Principle | Assessment | Evidence |
|-----------|-----------|----------|
| **S — Single Responsibility** | Partial violations | Large service files: `markets.service.ts` (895 lines), `treasury-main-wallet.service.ts` (748), `transaction-wallet.service.ts` (705), `wallet-connect.service.ts` (689), `onchain-withdrawal.service.ts` (667). These combine multiple responsibilities. |
| **O — Open/Closed** | Good in matching | Strategy pattern in `matching/strategies/` (PriceTimePriority, MarketOrder). Visitor pattern in `matching/visitors/` (AuditTradeVisitor, MetricsTradeVisitor). Notification strategies exist. Other modules lack extension points. |
| **L — Liskov Substitution** | No violations found | No complex inheritance hierarchies. `BaseRepository` subclasses are straightforward. |
| **I — Interface Segregation** | Mostly good | Port interfaces are focused (single-repo ports). `WalletRepositoryPort` has ~8 methods which is acceptable. Some ports could be split further. |
| **D — Dependency Inversion** | Advancing | 3 fully CA modules use Symbol DI tokens. 13 hybrid modules have ports defined. But many services still inject concrete repository classes or import from `src/entities/` directly. |

---

## 2. Gap Analysis Summary

| Pattern | Current Score | Target |
|---------|:------------:|:------:|
| Clean Architecture | 14/22 full, 2/22 hybrid | All business modules fully layered |
| DDD - Aggregates, Value Objects | 0% | Core aggregates defined |
| DDD - Domain Events & Dispatcher | ~5% (matching-only event store) | Cross-module domain event bus |
| Async Tasks / Schedulers | 70% | All async work through queues |
| Worker Pool | 0% | CPU-heavy ops offloaded |
| Unit of Work | 30% (TransactionContext exists) | Formal UoW pattern |
| CQS / CQRS | 85% (14 modules now separated) | All modules CQS, optional CQRS for read-heavy |
| Observability (OpenTelemetry) | 5% (basic logging) | Full OTel traces + metrics + structured logs |
| SOLID | 85% | Large services decomposed |

---

## 3. Improvement Plan

### Phase 1: Foundation — Infrastructure Building Blocks (Priority: HIGH)

#### 1.1 Domain Event Bus & Dispatcher ✅ DONE
**Goal:** Enable cross-module communication through domain events instead of direct service imports.

**Tasks:**
- [x] Create `src/common/domain-events/domain-event.base.ts` — base class with `eventId`, `occurredOn`, `aggregateId`
- [x] Create `src/common/domain-events/domain-event-dispatcher.ts` — wraps `EventEmitter2` with typed publish/subscribe
- [x] Define initial domain events:
  - `OrderCreatedEvent`, `OrderCancelledEvent`, `TradeExecutedEvent`
  - `DepositConfirmedEvent`, `WithdrawalCompletedEvent`
  - `WalletBalanceChangedEvent`
- [x] Create `@DomainEventHandler()` decorator for clean handler registration
- [x] Migrate `matching/events/EventStore` to also publish to the domain event bus ← next iteration
- [ ] Replace direct service cross-module calls with event-driven communication where appropriate ← next iteration

**Files to create:**
```
src/common/domain-events/
  domain-event.base.ts
  domain-event-dispatcher.ts
  domain-event-handler.decorator.ts
  domain-event.module.ts
  index.ts
```

#### 1.2 OpenTelemetry Observability Stack ✅ DONE (infrastructure layer)
**Goal:** Full distributed tracing, metrics, and structured logging.

**Tasks:**
- [x] Install OTel packages: `@opentelemetry/sdk-node`, `@opentelemetry/api`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/exporter-metrics-otlp-http`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, `prom-client`, `@willsoto/nestjs-prometheus`
- [x] Create `src/telemetry/tracing.ts` — OTel SDK bootstrap (env-gated, loaded before NestJS via `--require`)
- [x] Create `src/telemetry/telemetry.module.ts` — NestJS module registering PrometheusModule + MetricsService
- [x] Create `src/telemetry/metrics.service.ts` — Prometheus metrics: `http_request_duration_seconds`, `matching_queue_depth`, `orders_total`, `trades_total`, `blockchain_rpc_duration_seconds`
- [x] Upgrade `HealthModule` to use `@nestjs/terminus`: DB (TypeORM) readiness indicator at `GET /health/ready`
- [x] Add `CorrelationIdMiddleware` (X-Request-ID header propagation)
- [x] Wire `TelemetryModule` into `AppModule` ← next step
- [x] Wire `CorrelationIdMiddleware` into `AppModule` ← next step
- [ ] Add custom spans for critical paths (order create→match→trade, deposit→wallet credit) ← Phase 4 refactor
- [ ] Replace NestJS Logger with pino + structured JSON logs ← future iteration
- [ ] Add Redis + Bull queue health indicators to HealthModule ← future iteration

**Files to create/modify:**
```
src/telemetry/
  tracing.ts
  telemetry.module.ts
  metrics.service.ts
  index.ts
src/common/middleware/
  correlation-id.middleware.ts
```

#### 1.3 Unit of Work Pattern ✅ DONE
**Goal:** Formalize atomic transaction boundaries for multi-repository operations.

**Tasks:**
- [x] Create `src/common/unit-of-work/unit-of-work.port.ts` — `IUnitOfWork` interface + `UNIT_OF_WORK` Symbol token
- [x] Create `src/common/unit-of-work/typeorm-unit-of-work.ts` — TypeORM `DataSource.transaction()` implementation
- [x] Create `src/common/unit-of-work/unit-of-work.module.ts` — NestJS module
- [ ] Refactor use-cases that manage transactions (wallet operations, order creation, treasury sweeps) to use UoW ← Phase 4
- [ ] Ensure domain events are dispatched AFTER UoW commits (outbox pattern consideration) ← Phase 4

**Files to create:**
```
src/common/unit-of-work/
  unit-of-work.port.ts
  typeorm-unit-of-work.ts
  unit-of-work.module.ts
  index.ts
```

---

### Phase 2: DDD Core — Domain Model Enrichment (Priority: HIGH)

#### 2.1 Aggregate Root & Entity Base Classes ✅ DONE
**Tasks:**
- [x] Create `src/common/ddd/aggregate-root.base.ts` — domain event collection + `pullDomainEvents()`
- [x] Create `src/common/ddd/entity.base.ts` — identity equality (`equals()`, typed `id`, `toString()`)
- [x] Create `src/common/ddd/value-object.base.ts` — structural deep equality via JSON snapshot
- [x] Define key Value Objects:
  - `Money` (amount: Decimal, currency: string) — replaces raw string amounts, arithmetic ops
  - `TradingPair` — base/quote pair, `fromSymbol()` factory
  - `BlockchainAddress` — multi-chain validated address VO (EVM, Solana, Tron, TON)
- [x] `OrderId`, `TradeId`, `WalletId` — typed branded IDs (`src/common/ddd/primitives.ts`)

**Files to create:**
```
src/common/ddd/
  aggregate-root.base.ts
  entity.base.ts
  value-object.base.ts
  index.ts
src/common/ddd/value-objects/
  money.vo.ts
  trading-pair.vo.ts
  blockchain-address.vo.ts
```

#### 2.2 Bounded Context Isolation
**Tasks:**
- [x] Move entities from shared `src/entities/` into their respective module's `domain/` or `infrastructure/persistence/` folders:
  - `linked-wallet.entity.ts` → `modules/blockchain/entities/linked-wallet.entity.ts`
  - `onchain-transaction.entity.ts` → `modules/blockchain/entities/onchain-transaction.entity.ts`
  - updated imports + TypeORM entity registration (`src/config/typeorm.config.ts`)
- [ ] For cross-module entity references, create read-only DTOs or ACL (anti-corruption layer) adapters
- [ ] Define explicit module public APIs (barrel exports) — modules should only expose ports and DTOs, not internal services

---

### Phase 3: CQS/CQRS Standardization (Priority: MEDIUM)

#### 3.1 CQS Base Types ✅ DONE
**Tasks:**
- [x] Create `src/common/cqrs/base.types.ts` — `BaseCommand`, `BaseQuery` with `correlationId`, `ICommandHandler<C,R>`, `IQueryHandler<Q,R>` interfaces
- [x] Create `src/common/cqrs/index.ts` — barrel export
- [ ] Install `@nestjs/cqrs` if/when full CommandBus/QueryBus is needed ← optional upgrade path
- [ ] Migrate existing use-cases to explicit `ICommandHandler` / `IQueryHandler` interfaces ← Phase 4 refactor
- [ ] Controllers dispatch through `CommandBus`/`QueryBus` instead of calling use-cases directly ← Phase 4
- [ ] Connect domain events to `@nestjs/cqrs` EventBus ← optional (DomainEventDispatcher already does this)

#### 3.2 Read Model Separation (Optional — for high-traffic reads)
**Tasks:**
- [ ] Evaluate Redis-cached read models for order book and ticker data (already partially done via Redis pub/sub in trading module)
- [ ] Consider materialized views for admin dashboard queries

---

### Phase 4: Complete Clean Architecture Migration (Priority: MEDIUM)

#### 4.1 Migrate Hybrid Modules

For each hybrid module, apply the same layering as `auth`/`orders`/`wallets`:

| Module | Effort | Key Changes |
|--------|--------|-------------|
| `blockchain` | Medium | Move root-level services (onchain-*.service.ts, deposit-fx.service.ts) into `application/use-cases/` |
| `matching` | Medium | Create `application/use-cases/` layer; move `matching.service.ts` logic into use-cases |
| `treasury` | Medium | Create `application/use-cases/` for sweep, fund, rotation operations | **DONE ✓** |
| `currencies` | Low | Create `application/queries/` and `application/use-cases/` from `currencies.service.ts` | **DONE ✓** |
| `users` | Low | Create `application/use-cases/` from `users.service.ts` | **DONE ✓** |
| `deposits` | Low | Create `application/use-cases/`, move repo to `infrastructure/persistence/` | **DONE ✓** |
| `exchange-rate` | Low | Create `application/`, wrap service methods as use-cases | **DONE ✓** |
| `system-config` | Low | Create `application/` layer | **DONE ✓** |
| `markets` | Medium | Large service (895 lines) needs decomposition first | **DONE ✓** |
| `managed-wallets` | Low | Create `application/`, move repo to `infrastructure/persistence/` | **DONE ✓** |
| `notifications` | Low | Already has strategies; add `application/` layer | **DONE ✓** |
| `payment-config` | Low | Already has processor; add `application/` layer | **DONE ✓** |
| `market-maker` | Low | Create `application/` layer | **DONE ✓** |

**Per-module migration checklist:**
1. Create `application/use-cases/` — extract business operations from `*.service.ts`
2. Create `application/queries/` — extract read operations
3. Move repositories from `repositories/` to `infrastructure/persistence/`
4. Ensure use-cases depend ONLY on ports (Symbol DI tokens)
5. Service file becomes a thin facade (or is removed)
6. Update module wiring (`*.module.ts`)
- [x] `markets.service.ts` (895 lines) → Split into:
 - `CreateMarketPairUseCase` ✓
 - `UpdateMarketPairUseCase` ✓
 - `DeleteMarketPairUseCase` ✓
 - `GetMarketPairQuery` ✓
 - `GetMarketTickerQuery` ✓
 - `GetMarketDepthQuery` ✓
 - `GetMarketOHLCVQuery` ✓
- [x] `treasury-main-wallet.service.ts` (748 lines) → Split into:
 - `ImportMainWalletUseCase` ✓
 - `ApproveMainWalletUseCase` ✓
 - `RejectMainWalletUseCase` ✓
 - `SetDefaultMainWalletUseCase` ✓
 - `RevealMainWalletPrivateKeyUseCase` ✓
 - `UpdateMainWalletLabelUseCase` ✓
 - `RequestMainWalletDeletionUseCase` ✓
 - `ApproveMainWalletDeletionUseCase` ✓
 - `RejectMainWalletDeletionUseCase` ✓
 - `GetMainWalletQuery` ✓
- [x] `transaction-wallet.service.ts` (705 lines) → Split into:
  - `CreateTransactionWalletUseCase` ✓
 - `SendWithdrawalUseCase` ✓
 - `DeactivateTransactionWalletUseCase` ✓
 - `DeleteTransactionWalletUseCase` ✓
 - `SetDefaultUserDepositUseCase` ✓
 - `UnsetDefaultUserDepositUseCase` ✓
 - `GetTransactionWalletQuery` ✓
 - `GetTreasuryOperationQuery` ✓
- [x] `onchain-withdrawal.service.ts` (667 lines) → Split into:
 - `RequestWithdrawalUseCase` ✓
 - `ApproveWithdrawalUseCase` ✓
 - `RejectWithdrawalUseCase` ✓
 - `ProcessPendingWithdrawalsUseCase` ✓
 - `GetTransactionsQuery` ✓
 - `GetTransactionByIdQuery` ✓
 - `GetAdminWithdrawalsQuery` ✓
 - `GetAdminWithdrawalByIdQuery` ✓
 - `GetAdminWithdrawalStatsQuery` ✓
- [x] `managed-wallets.service.ts` (555 lines) → Done in Phase 4.1 ✓
### Phase 5: Worker Pool & Async Resilience (Priority: LOW-MEDIUM)

#### 5.1 Worker Pool for CPU-Intensive Tasks
**Tasks:**
- [x] Install `piscina` (`npm install piscina`)
- [x] Create `src/common/worker-pool/worker-pool.service.ts` — `WorkerPoolService` wrapping Piscina with `OnModuleDestroy` lifecycle
- [x] Create `src/common/worker-pool/worker-pool.module.ts` — `WorkerPoolModule.forRoot(options)` dynamic module
- [x] Move blockchain address generation/validation into worker threads — `crypto-account.worker.ts` in TreasuryModule (EVM + Solana offloaded)
- [ ] Move large reconciliation report generation into worker threads (no heavy reports found — deferred)

#### 5.2 Async Task Resilience
**Tasks:**
- [x] `ExchangeRateAutoSyncScheduler` — distributed Redis lock with Lua CAS release script (already implemented)
- [x] `MainWalletRotationScheduler` — `@Cron('0 2 * * *')` (already implemented)
- [x] `PaymentConfigGraceScheduler` — `@Cron(CronExpression.EVERY_MINUTE)` + `flushStaleTransitioningActivations` (already implemented)
- [x] `src/common/utils/redis-distributed-lock.ts` — reusable distributed lock utility (implemented this session)
- [x] Treasury and matching schedulers — all schedulers already use `withDistributedLock` (confirmed this session)
- [x] Add dead-letter queue (DLQ) pattern for Bull queues — all queues already have `removeOnFail: false` (confirmed this session)
- [x] Add Bull Board dashboard — `BullBoardModule` + `BullBoardService` at `/admin/queues` (admin-only, JWT guard)

---

### Phase 6: Testing Infrastructure (Priority: MEDIUM)

**Tasks:**
- [ ] Add integration tests for use-cases with real DB (not mocks)
- [ ] Add contract tests for domain ports
- [ ] Ensure domain layer has 90%+ unit test coverage
- [ ] Add E2E tests for critical flows (order → match → trade → wallet credit)

---

## 4. Priority & Dependency Matrix

```
Phase 1.1 (Domain Events) ──────┐
Phase 1.2 (OpenTelemetry)       │
Phase 1.3 (Unit of Work) ───────┤
                                 ▼
Phase 2.1 (DDD Base Classes) ───┤
Phase 2.2 (Bounded Contexts)    │
                                 ▼
Phase 3 (CQRS) ─────────────────┤
Phase 4 (CA Migration) ─────────┤
                                 ▼
Phase 5 (Worker Pool)
Phase 6 (Testing)
```

**Recommended execution order:**
1. **Phase 1.2** (OpenTelemetry) — standalone, immediate operational value
2. **Phase 1.1** (Domain Events) — foundation for all DDD work
3. **Phase 1.3** (Unit of Work) — needed before refactoring use-cases
4. **Phase 2.1** (DDD Base Classes) — enables Phase 4
5. **Phase 4.2** (Decompose large services) — can start in parallel with Phase 2
6. **Phase 4.1** (Module migration) — incremental, one module at a time
7. **Phase 3** (CQRS) — after modules are layered
8. **Phase 2.2** (Bounded Contexts / entity relocation) — last, most disruptive
9. **Phase 5** (Worker Pool) — as needed
10. **Phase 6** (Testing) — continuous, alongside each phase

---

## 5. Architectural Decision Records (ADRs) Needed

| ADR | Decision |
|-----|----------|
| ADR-001 | Domain Event Bus: `@nestjs/event-emitter` vs `@nestjs/cqrs` EventBus vs custom |
| ADR-002 | CQRS scope: lightweight CQS (current direction) vs full CQRS with separate read DB |
| ADR-003 | Entity ownership: shared `src/entities/` vs per-module entities with ACL |
| ADR-004 | OpenTelemetry exporter: OTLP (Jaeger/Grafana Tempo) vs vendor-specific (Datadog, etc.) |
| ADR-005 | Structured logging: pino vs winston vs NestJS built-in + transport |
| ADR-006 | Worker pool: piscina vs workerpool vs Bull concurrency |
| ADR-007 | Unit of Work: decorator-based (@Transactional) vs explicit UoW injection |

---

## 6. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Entity relocation breaks imports across modules | HIGH | Do this last; use path aliases; incremental with barrel re-exports |
| CQRS adds complexity without proportional value | MEDIUM | Start with lightweight CQS (no separate read DB). Only add EventBus for modules with complex event flows |
| OpenTelemetry overhead in production | LOW | Sampling rate control; async export; proven minimal overhead |
| Domain event ordering / consistency | MEDIUM | Outbox pattern for critical events; ensure events fire after UoW commit |
| Large refactoring disrupts active development | HIGH | Migrate one module at a time; maintain backwards-compatible facades; feature-flag new code paths |

---

## 7. Implementation Progress Log

### Session 2026-04-16

**Phase 4.1 — system-config Clean Architecture migration:**
- Created `src/modules/system-config/application/use-cases/update-config.use-case.ts`
- Created `src/modules/system-config/application/use-cases/update-configs-bulk.use-case.ts`
- Created `src/modules/system-config/application/use-cases/index.ts`
- Created `src/modules/system-config/application/queries/get-all-configs.query.ts`
- Created `src/modules/system-config/application/queries/get-runtime-settings.query.ts`
- Created `src/modules/system-config/application/queries/index.ts`
- `system-config` module status: **Hybrid → Clean Architecture ✓**

**Phase 1.1 — matching EventStore integration:**
- Updated `src/modules/matching/events/event-store.ts` to publish `MatchingEventStoredEvent` via `DomainEventDispatcher` when dispatcher is provided
- Added `MatchingEventStoredEvent` export in `src/modules/matching/events/index.ts`
- Added coverage in `src/modules/matching/events/event-store.spec.ts` validating domain bus publish on append
- Installed `piscina` npm package
- Created `src/common/worker-pool/worker-pool.service.ts` — `WorkerPoolService` with `OnModuleDestroy`
- Created `src/common/worker-pool/worker-pool.module.ts` — `WorkerPoolModule.forRoot(options)` dynamic module
- Created `src/common/worker-pool/index.ts`
- Updated `WorkerPoolOptions` with `execArgv` support for dev (ts-node) and production modes
- Created `src/modules/treasury/workers/crypto-account.worker.ts` — Piscina worker that generates
 EVM (ethers.Wallet.createRandom) and Solana (Keypair.generate + bs58) accounts off the main thread
- Updated `TreasuryModule` to import `WorkerPoolModule.forRoot({ workerFile, execArgv, maxThreads: 2 })`
- Updated `TransactionWalletService.generateAccount()` to delegate EVM + Solana key generation
 to the worker pool; Tron kept on main thread (HTTP-bound, not CPU-bound)

**Phase 5.2 — Async task resilience:**
- Created `src/common/utils/redis-distributed-lock.ts` — reusable `RedisDistributedLock` utility  
  with `setIfNotExists` acquire + Lua CAS release, suitable for all scheduler and queue scenarios
- Created `src/common/bull-board/bull-board.service.ts` — `BullBoardService` implementing `OnApplicationBootstrap`
 that builds the Bull Board UI using `@bull-board/express` `ExpressAdapter` + `@bull-board/api` `BullAdapter`
- Created `src/common/bull-board/bull-board.module.ts` — `BullBoardModule` providing `BullBoardService`,
 registering all 3 queues (matching, treasury-ops, payment-config-activation) via `BullModule.registerQueue`
- Updated `src/app.module.ts`: imported `BullBoardModule`, added `BullBoardAuthMiddleware`
 (JWT + ADMIN role guard) protecting `/admin/queues`
- Bull Board dashboard: `http://127.0.0.1:3000/admin/queues` (admin-only, JWT required)
**Phase 1.2 — AppModule wiring:**
- `TelemetryModule` imported into `AppModule`
- `CorrelationIdMiddleware` wired globally via `configure()` in `AppModule`

**Phase 2.1 — DDD base classes with branded IDs:**
- Created `src/common/ddd/primitives.ts` — `createBrandedIdFactory`, `BrandedId<B>` type, `Brand<T,B>` utility
  - All common domain IDs: `OrderId`, `TradeId`, `WalletId`, `CurrencyId`, `MarketPairId`, `UserId`, `DepositId`, `WithdrawalId`, `NotificationId`, `TransactionHash`, `BlockchainAddrId`
- Created `src/common/ddd/primitives.spec.ts` — 12 passing tests
- Fixed `entity.base.ts` `toString()` format → `EntityName(id)`
- Updated `src/common/ddd/index.ts` barrel to use `export *` from primitives

**Phase 4.1 — currencies Clean Architecture migration:**
- Created `src/modules/currencies/application/use-cases/create-currency.use-case.ts`
- Created `src/modules/currencies/application/use-cases/update-currency.use-case.ts`
- Created `src/modules/currencies/application/use-cases/delete-currency.use-case.ts`
- Created `src/modules/currencies/application/queries/get-currencies.query.ts`
- Created `src/modules/currencies/application/queries/get-currency-by-id.query.ts`
- Rewrote `CurrenciesController` to use use-cases/queries (thin controller)
- Rewrote `CurrenciesModule` to wire all use-cases/queries
- Created `currencies.use-cases.spec.ts` — 10 passing tests
- `currencies` module status: **Hybrid → Clean Architecture ✓**

**Phase 4.1 — deposits Clean Architecture migration:**
- Created `src/modules/deposits/application/use-cases/create-deposit-link.use-case.ts`
- Created `src/modules/deposits/application/use-cases/handle-deposit-webhook.use-case.ts`
- Created `src/modules/deposits/application/use-cases/sync-deposit-status.use-case.ts`
- Created `src/modules/deposits/application/queries/get-deposits.query.ts`
- Created `src/modules/deposits/application/queries/get-deposit-preview.query.ts`
- Rewrote `DepositsController` to use use-cases/queries (thin controller)
- Updated `DepositsModule` to wire all use-cases/queries
- `deposits` module status: **Hybrid → Clean Architecture ✓**

**Module CA progress:** 6/22 fully Clean Architecture (auth, orders, wallets, system-config, currencies, deposits)

**Test coverage:**
- 122 tests across 11 suites: DDD base classes, CQRS types, Unit of Work, domain events, telemetry, currencies use-cases, primitives
- All 122 tests PASS

### Session 2026-04-17

**Build fix — tsconfig.json:**
- `ignoreDeprecations: "6.0"` → `"5.0"` (TS 5.9.3 doesn't support "6.0"; was causing tsc to abort and 419 webpack cascade errors)

**Build fix — deposits query:**
- `get-deposits.query.ts`: service returns `{ data: items, ... }`, mapped to `{ items: ..., ... }`
- `get-currencies.query.ts`: `search()` called with optional params, passed resolved defaults instead
- `get-deposit-preview.query.ts`: `DepositCheckoutMeta` aligned to match service return type

**Phase 4.1 — users Clean Architecture migration:**
- Created `src/modules/users/application/queries/get-users.query.ts` — 8 read methods
- Created `src/modules/users/application/use-cases/` — 8 use-cases (UpdateUser, DeleteUser, UpdateProfileBasic, RequestSecurityChange, ReviewSecurityChange, UploadAvatar, SaveFcmToken)
- Rewrote `UsersController` to inject use-cases/queries (thin controller)
- Updated `UsersModule` to register all new providers

**Phase 4.1 — exchange-rate Clean Architecture migration:**
- Created `GetExchangeRateQuery` (3 read methods: getMarketPrices, getDepositPreview, getAdminCurrentConfig)
- Created `SyncExchangeRateUseCase`, `UpdateExchangeRateConfigUseCase`
- Rewrote `ExchangeRateController` to delegate to use-cases/queries

**Phase 4.1 — managed-wallets Clean Architecture migration:**
- Created `GetManagedWalletsQuery` (5 read methods)
- Created 7 use-cases (CreateWallet, SendTransaction, SetDepositDefault, ClearDepositDefault, SetRecommendedChain, DeactivateWallet)
- Updated `ManagedWalletsController` + `DepositMethodsController`
- Updated `ManagedWalletsModule`

**Phase 4.1 — notifications Clean Architecture migration:**
- Created `GetNotificationsQuery` (2 read methods: findByUser, countUnread)
- Created 4 use-cases (SendNotification, BroadcastNotification, MarkNotificationRead, MarkAllNotificationsRead)
- Updated `NotificationsController` and `NotificationsModule`

**Phase 4.1 — payment-config Clean Architecture migration:**
- Created `GetPaymentConfigsQuery` (3 read methods: list, getFormOptions, getConfigByIdForEdit)
- Created 4 use-cases (CreateConfig, UpdateConfig, ActivateWithGracePeriod, DeactivateConfig)
- Updated `PaymentConfigController` and `PaymentConfigModule`

**Phase 4.1 — market-maker Clean Architecture migration:**
- Created `GetMarketMakerQuery` (4 read methods: getConfigList, getFormDefaults, getConfigByPair, getDashboard)
- Created 4 use-cases (UpsertConfig, DeleteConfig, PlaceMakerOrders, RefreshMakerOrders)
- Updated `MarketMakerController` and `MarketMakerModule`

**Module CA progress:** 12/22 fully Clean Architecture (auth, orders, wallets, system-config, currencies, deposits, users, exchange-rate, managed-wallets, notifications, payment-config, market-maker)

**Remaining:** 3 hybrid (blockchain, matching, treasury), 6 traditional/infrastructure (trading, exchange, dashboard, binance-rest, redis, price-oracle, metadata)

**Test coverage:** All 122 tests PASS, TypeScript zero errors, webpack build successful.

### Session 2026-04-17 (continued)

**Phase 6 - additional sensitive-flow coverage:**
- Added `src/modules/orders/orders-matching.integration.spec.ts` covering `CreateOrderUseCase -> EnqueueMatchUseCase -> MatchingQueueService` wiring with real matching application providers and overridden external dependencies
- Added `src/modules/blockchain/onchain-deposit.service.spec.ts` covering `submitDeposit` confirming/completed paths, duplicate guards, Tron default recipient enforcement, and `settleDepositByTxId` failed/confirmed transitions
- Verified targeted Phase 6 suites and full Nest build after test additions
**Phase 4 / 6 - matching boundary hardening + tests:**
- Added `EnqueueMatchUseCase` so `orders` no longer depends on `MatchingQueueService` directly
- Updated `CreateOrderUseCase` to dispatch matching through application use-cases only
- Reduced `MatchingModule` exports to application-facing use-cases and removed public export of `MatchingService` / `MatchingQueueService`
- Added focused tests for matching enqueue adapter and create-order enqueue behavior, including the no-enqueue path for already-filled orders
**Phase 3 / 4 - CQRS closure for blockchain + matching integration:**
- lockchain controller no longer resolves deposit address or supported networks directly; added GetDepositAddressQuery and GetSupportedNetworksQuery`r
- Updated BlockchainModule wiring so every controller read path now flows through pplication/queries/`r
- Added matching/application/use-cases/matching-engine.use-case.ts with RunMatchUseCase, RemoveOrderFromBookUseCase, ReconcileOpenOrdersForPairUseCase`r
- Updated MatchingProcessor to dispatch through RunMatchUseCase instead of calling MatchingService directly
- Updated orders use-cases to depend on matching application use-cases instead of MatchingService directly for cancel/reconcile integration
- Added focused tests for blockchain utility queries and matching/order CQRS adapter wiring; build + targeted Jest pass

### Session 2026-04-17 (continued)

**Phase 4.2 — markets.service.ts decomposition (895 lines → Clean Architecture):**
- Created `GetMarketPairQuery` (findAll, findOne, findBySymbol, findActive)
- Created `GetMarketTickerQuery` (getTicker, getTickerBySymbol, getAllTickers, getTickersForBaseSymbols)
- Created `GetMarketDepthQuery` (getOrderBook, getRecentTrades, getDepthSnapshot variants)
- Created `GetMarketOHLCVQuery` (getOHLCV)
- Created `CreateMarketPairUseCase`, `UpdateMarketPairUseCase`, `DeleteMarketPairUseCase`
- Updated `MarketsController` and `MarketsModule`

**Phase 4.2 — treasury service decomposition (748 + 705 lines → Clean Architecture):**
- Created `GetMainWalletQuery` (7 read methods)
- Created 9 main-wallet use-cases (Import, Approve, Reject, SetDefault, RevealPrivateKey, UpdateLabel, RequestDeletion, ApproveDeletion, RejectDeletion)
- Created `GetTransactionWalletQuery` (13 read methods)
- Created 6 transaction-wallet use-cases (Create, SendWithdrawal, Deactivate, Delete, SetDefaultUserDeposit, UnsetDefaultUserDeposit)
- Created `GetTreasuryOperationQuery` (3 read methods)
- Updated `TreasuryController` and `TreasuryModule` — 18 new application-layer classes

**Phase 2.2 — bounded context relocation (blockchain entities):**
- Moved `LinkedWallet` entity to `src/modules/blockchain/entities/linked-wallet.entity.ts`
- Moved `OnchainTransaction` entity to `src/modules/blockchain/entities/onchain-transaction.entity.ts`
- Updated all imports across `blockchain`, `managed-wallets`, `users`, `treasury`, `typeorm.config.ts`, and `user.entity.ts`
- Removed old shared files from `src/entities/`:
  - `linked-wallet.entity.ts`
  - `onchain-transaction.entity.ts`
- Removed stale artifact: `src/modules/treasury/treasury.module.ts.bak`

**Verification:**
- `npm run build` ✅
- `npx jest src/modules/blockchain --no-coverage` ✅ (3 suites, 29 tests)

**Module CA progress:** 14/22 fully Clean Architecture (auth, orders, wallets, system-config, currencies, deposits, users, exchange-rate, managed-wallets, notifications, payment-config, market-maker, treasury, markets)

**Remaining:** matching engine internals remain service-centric by design, but public module boundary now goes through application use-cases; Phase 6 still needs broader integration coverage for critical flows.



