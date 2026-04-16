# Architecture Audit & Improvement Plan

**Project:** be-cryptocurrency-trading-app (NestJS / TypeScript)
**Date:** 2026-04-16
**Branch:** develop

---

## 1. Current State Audit

### 1.1 Clean Architecture — Module Inventory

| Module | domain/ | application/ | infrastructure/ | Port DI (Symbol) | Classification |
|--------|---------|-------------|----------------|-------------------|----------------|
| `auth` | ports, (no domain services) | use-cases, ports (TokenIssuer, PasswordHasher) | persistence, providers | AUTH_REPOSITORY, TOKEN_ISSUER, PASSWORD_HASHER | **Clean Architecture** |
| `orders` | ports, services (OrderReservePolicy, OrderValidation) | use-cases, queries, services | persistence | ORDER_REPOSITORY | **Clean Architecture** |
| `wallets` | ports (6 ports), services (BalanceCalculation) | use-cases (5), queries (4) | persistence, adapters | WALLET_REPOSITORY, WALLET_LEDGER_REPOSITORY, ADMIN_ADJUSTMENT_REPOSITORY, WALLET_EVENT_PUBLISHER, CURRENCY_LOOKUP, EXCHANGE_SERVICE_PORT | **Clean Architecture** |
| `blockchain` | ports (LinkedWallet, OnchainTransaction) | use-cases, queries | persistence | LINKED_WALLET_REPOSITORY, ONCHAIN_TRANSACTION_REPOSITORY | **Hybrid** — has application layer but many services at module root (onchain-*.service.ts, deposit-fx.service.ts) |
| `matching` | ports (MatchingRepository, TradeAuditLog) | (none) | persistence | MATCHING_REPOSITORY, TRADE_AUDIT_LOG_REPOSITORY | **Hybrid** — has event store, strategies, visitors but no application/use-cases layer |
| `currencies` | ports (CurrencyRepository) | (none) | persistence | CURRENCY_REPOSITORY | **Hybrid** — port-based repo but flat service |
| `treasury` | ports (4 repos) | (none) | persistence | 4 Symbol tokens | **Hybrid** — ports done, but services at module root |
| `users` | ports (UsersRepository) | (none) | persistence | USERS_REPOSITORY | **Hybrid** — port exists but flat service/controller |
| `deposits` | ports (FiatDepositRepository) | (none) | (none) | FIAT_DEPOSIT_REPOSITORY | **Hybrid** — port defined, no infrastructure layer |
| `exchange-rate` | ports (ExchangeRateAuditRepository) | (none) | persistence, providers | EXCHANGE_RATE_AUDIT_REPOSITORY | **Hybrid** — repo port + provider pattern |
| `system-config` | ports (SystemConfigRepository) | (none) | persistence | SYSTEM_CONFIG_REPOSITORY | **Hybrid** — port-based, flat service |
| `markets` | ports (MarketRepository) | (none) | persistence | (injection-tokens.ts) | **Hybrid** — has processors, repos still mixed |
| `managed-wallets` | ports (ManagedWalletsDataRepository) | (none) | (none) | MANAGED_WALLETS_DATA_REPOSITORY | **Hybrid** — port defined, repos in legacy folder |
| `notifications` | ports (NotificationRepository) | (none) | (none) | (injection-tokens.ts) | **Hybrid** — port defined, strategies exist |
| `payment-config` | ports (PaymentConfigRepository) | (none) | (none) | PAYMENT_CONFIG_REPOSITORY | **Hybrid** — port defined, has processor |
| `market-maker` | ports (injection-tokens) | (none) | (none) | MARKET_MAKER_CONFIG_REPOSITORY | **Hybrid** — port token only |
| `trading` | (none) | (none) | (none) | (none) | **Traditional NestJS** — services, clients, WebSocket |
| `exchange` | (none) | (none) | (none) | (none) | **Traditional NestJS** — flat services |
| `dashboard` | (none) | (none) | (none) | (none) | **Traditional NestJS** — flat controller/service |
| `binance-rest` | (none) | (none) | (none) | (none) | **Traditional NestJS** — single service |
| `redis` | (none) | (none) | (none) | (none) | **Infrastructure** — shared module |
| `price-oracle` | (none) | (none) | (none) | (none) | **Traditional NestJS** — providers |
| `metadata` | (none) | (none) | (none) | (none) | **Traditional NestJS** — enum builder |

**Summary:** 3 modules fully Clean Architecture, 13 hybrid (ports defined but services not layered), 6 traditional/infrastructure.

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
| **Manual CQS** | Partial | `orders/application/queries/` and `orders/application/use-cases/` separate reads/writes. `wallets/application/queries/` and `wallets/application/use-cases/` also separated. `blockchain/application/queries/` exists. |
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
| Clean Architecture | 3/22 full, 13/22 hybrid | All business modules fully layered |
| DDD - Aggregates, Value Objects | 0% | Core aggregates defined |
| DDD - Domain Events & Dispatcher | ~5% (matching-only event store) | Cross-module domain event bus |
| Async Tasks / Schedulers | 70% | All async work through queues |
| Worker Pool | 0% | CPU-heavy ops offloaded |
| Unit of Work | 30% (TransactionContext exists) | Formal UoW pattern |
| CQS / CQRS | 20% (3 modules manual) | All modules CQS, optional CQRS for read-heavy |
| Observability (OpenTelemetry) | 5% (basic logging) | Full OTel traces + metrics + structured logs |
| SOLID | 60% | Large services decomposed |

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
- [ ] Migrate `matching/events/EventStore` to also publish to the domain event bus ← next iteration
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
- [ ] Wire `TelemetryModule` into `AppModule` ← next step
- [ ] Wire `CorrelationIdMiddleware` into `AppModule` ← next step
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
- [ ] `OrderId`, `TradeId`, `WalletId` — typed branded IDs ← future iteration

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
- [ ] Move entities from shared `src/entities/` into their respective module's `domain/` or `infrastructure/persistence/` folders:
  - `order.entity.ts` → `orders/infrastructure/persistence/`
  - `trade.entity.ts` → `matching/infrastructure/persistence/`
  - `wallet.entity.ts` → `wallets/infrastructure/persistence/`
  - (etc.)
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
| `treasury` | Medium | Create `application/use-cases/` for sweep, fund, rotation operations |
| `currencies` | Low | Create `application/queries/` and `application/use-cases/` from `currencies.service.ts` |
| `users` | Low | Create `application/use-cases/` from `users.service.ts` |
| `deposits` | Low | Create `application/use-cases/`, move repo to `infrastructure/persistence/` |
| `exchange-rate` | Low | Create `application/`, wrap service methods as use-cases |
| `system-config` | Low | Create `application/` layer |
| `markets` | Medium | Large service (895 lines) needs decomposition first |
| `managed-wallets` | Low | Create `application/`, move repo to `infrastructure/persistence/` |
| `notifications` | Low | Already has strategies; add `application/` layer |
| `payment-config` | Low | Already has processor; add `application/` layer |
| `market-maker` | Low | Create `application/` layer |

**Per-module migration checklist:**
1. Create `application/use-cases/` — extract business operations from `*.service.ts`
2. Create `application/queries/` — extract read operations
3. Move repositories from `repositories/` to `infrastructure/persistence/`
4. Ensure use-cases depend ONLY on ports (Symbol DI tokens)
5. Service file becomes a thin facade (or is removed)
6. Update module wiring (`*.module.ts`)

#### 4.2 Decompose Large Services
**Tasks (SRP violations):**
- [ ] `markets.service.ts` (895 lines) → Split into:
  - `CreateMarketPairUseCase`
  - `UpdateMarketPairUseCase`
  - `GetTickerQuery`
  - `GetOhlcvQuery`
  - `MarketPairValidationService` (domain)
- [ ] `treasury-main-wallet.service.ts` (748 lines) → Split into:
  - `RotateMainWalletUseCase`
  - `CheckMainWalletBalanceUseCase`
  - `GetMainWalletStatusQuery`
- [ ] `onchain-withdrawal.service.ts` (667 lines) → Split into:
  - `InitiateWithdrawalUseCase`
  - `ProcessWithdrawalUseCase`
  - `CheckWithdrawalStatusQuery`
- [ ] `managed-wallets.service.ts` (555 lines) → Similar decomposition

---

### Phase 5: Worker Pool & Async Resilience (Priority: LOW-MEDIUM)

#### 5.1 Worker Pool for CPU-Intensive Tasks
**Tasks:**
- [ ] Evaluate `piscina` or `workerpool` for CPU-heavy operations:
  - Crypto address validation/derivation
  - Large report generation (reconciliation exports)
  - Batch market data processing
- [ ] Create `src/common/worker-pool/worker-pool.module.ts`
- [ ] Move blockchain address generation into worker threads

#### 5.2 Async Task Resilience
**Tasks:**
- [ ] Add dead-letter queue (DLQ) pattern for all Bull queues
- [ ] Add Bull Board or similar dashboard for queue monitoring
- [ ] Ensure all schedulers have distributed lock patterns (exchange-rate already has this — replicate for all)
- [ ] Add queue health metrics to OTel metrics

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
