# Architecture Audit & Improvement Plan

**Project:** be-cryptocurrency-trading-app (NestJS / TypeScript)
**Date:** 2026-04-17
**Branch:** develop

---

## 1. Current State Audit

### 1.1 Clean Architecture - Module Inventory

| Module | domain/ | application/ | infrastructure/ | Port DI (Symbol) | Classification |
|--------|---------|-------------|----------------|-------------------|----------------|
| `auth` | ports, (no domain services) | use-cases, ports (TokenIssuer, PasswordHasher) | persistence, providers | AUTH_REPOSITORY, TOKEN_ISSUER, PASSWORD_HASHER | **Clean Architecture ✓** |
| `orders` | ports, services (OrderReservePolicy, OrderValidation) | use-cases, queries, services | persistence | ORDER_REPOSITORY | **Clean Architecture ✓** |
| `wallets` | ports (6 ports), services (BalanceCalculation) | use-cases (5), queries (4) | persistence, adapters | WALLET_REPOSITORY, WALLET_LEDGER_REPOSITORY, ADMIN_ADJUSTMENT_REPOSITORY, WALLET_EVENT_PUBLISHER, CURRENCY_LOOKUP, EXCHANGE_SERVICE_PORT | **Clean Architecture ✓** |
| `blockchain` | ports, domain services | use-cases, queries | persistence, providers | LINKED_WALLET_REPOSITORY, ONCHAIN_TRANSACTION_REPOSITORY | **Clean Architecture ✓** |
| `matching` | ports, domain services | use-cases | persistence, queue, observers, projections | MATCHING_REPOSITORY, TRADE_AUDIT_LOG_REPOSITORY | **Clean Architecture boundary ✓** |
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
| `trading` | (none) | (none) | (none) | (none) | **Traditional NestJS** - services, clients, WebSocket |
| `exchange` | (none) | (none) | (none) | (none) | **Traditional NestJS** - flat services |
| `dashboard` | (none) | (none) | (none) | (none) | **Traditional NestJS** - flat controller/service |
| `binance-rest` | (none) | (none) | (none) | (none) | **Traditional NestJS** - single service |
| `redis` | (none) | (none) | (none) | (none) | **Infrastructure** - shared module |
| `price-oracle` | (none) | (none) | (none) | (none) | **Traditional NestJS** - providers |
| `metadata` | (none) | (none) | (none) | (none) | **Traditional NestJS** - enum builder |

**Summary:** 15/22 modules now have a clean architecture boundary at module level; `blockchain` and `matching` are no longer root-service hybrids, while traditional/infrastructure modules remain for later work.

### 1.2 Domain-Driven Design (DDD)

| Pattern | Status | Details |
|---------|--------|---------|
| **Bounded Contexts** | Advancing | `blockchain` entities were relocated into the module and public API cleanup has started. Some cross-module TypeORM entity references still exist and should move toward DTO/ACL read models. |
| **Aggregates / Aggregate Roots** | Missing | No aggregate root base class adoption inside business modules yet. TypeORM entities still carry most invariants. |
| **Value Objects** | Foundation done | Shared VO primitives exist (`Money`, `TradingPair`, `BlockchainAddress`), but core business flows still mostly pass primitives/DTOs. |
| **Domain Services** | Partial | `orders`, `wallets`, `matching`, and `blockchain` now have explicit `domain/services/`; more policy extraction is still needed. |
| **Domain Events** | Minimal | Matching event store can publish to the shared domain event bus, but cross-module business flows are still mostly direct-call based. |
| **Domain Event Dispatcher** | Implemented | Shared dispatcher and decorator exist in `src/common/domain-events/`; adoption is still partial. |
| **Repository Pattern (DDD)** | Partial | Symbol-based ports are established, but many application services still consume TypeORM-shaped entities rather than domain aggregates or read DTOs. |
| **Ubiquitous Language** | Partial | Trading and wallet terms are consistent; explicit aggregate and ACL vocabulary is still missing. |

### 1.3 CQS / CQRS

| Pattern | Status | Details |
|---------|--------|---------|
| **@nestjs/cqrs** | Not installed | No CommandBus, QueryBus, or handler decorators found. |
| **Manual CQS** | Strong | Business modules consistently separate `application/queries/` and `application/use-cases/`, including `blockchain` and `matching` module boundaries. |
| **Controllers** | Improved | Controllers delegate through query/use-case classes, though endpoint layout is still HTTP-centric rather than strict read/write segregation. |

**Assessment:** lightweight CQS is now the project standard. Full CQRS infrastructure remains optional.

### 1.4 Unit of Work

| Pattern | Status | Details |
|---------|--------|---------|
| **TransactionContext** | Implemented | Opaque `TransactionContext` type in `src/common/types/transaction-context.ts`. Infrastructure casts to EntityManager. Domain layer does not see ORM types. |
| **UnitOfWork class** | Implemented foundation | Shared `UNIT_OF_WORK` port and TypeORM implementation exist. Adoption inside high-risk flows is still incomplete. |
| **Transaction propagation** | Mixed | Some newer flows can use the shared UoW, but many services still pass transactions manually. |

### 1.5 Async Tasks & Scheduler Tasks

| Pattern | Status | Details |
|---------|--------|---------|
| **@nestjs/schedule** | Installed | 3 schedulers: `ExchangeRateAutoSyncScheduler`, `MainWalletRotationScheduler`, `PaymentConfigGraceScheduler`. Redis distributed locks prevent overlap. |
| **Bull Queues** | Installed | 3 queues: `matching`, `treasury`, `payment-config`, each with dedicated processors. Matching queue remains concurrency=1 by design. |
| **Error handling** | Per-queue | Bull retry policies and scheduler try/catch logging are in place. |

### 1.6 Worker Pool

| Pattern | Status | Details |
|---------|--------|---------|
| **Worker threads** | Partial | Piscina worker pool exists and treasury crypto account generation is offloaded. |
| **Cluster mode** | Missing | No `cluster` or PM2 cluster configuration found. |
| **Bull concurrency** | Minimal | Matching stays single-threaded; other queues use standard Bull behavior. |

### 1.7 Observability: OpenTelemetry

| Component | Status | Details |
|-----------|--------|---------|
| **OpenTelemetry SDK** | Installed | Telemetry bootstrap and Prometheus metrics module are in place. |
| **Distributed Tracing** | Partial | Base SDK wiring exists, but custom spans for core flows are still pending. |
| **Metrics** | Partial | Prometheus/NestJS metrics exist; queue and runtime coverage can still improve. |
| **Structured Logging** | Partial | Correlation IDs are wired, but logger output still uses Nest `Logger` instead of structured JSON. |
| **Health Checks** | Improved | `HealthModule` uses Terminus for readiness, but Redis and Bull health indicators are still pending. |
| **Error Tracking** | Basic | Exception filter exists; no external error tracking yet. |

### 1.8 SOLID Principles

| Principle | Assessment | Evidence |
|-----------|-----------|----------|
| **S - Single Responsibility** | Improved but incomplete | Major decompositions were completed for markets, treasury, managed-wallets, matching boundary, and blockchain boundary, but files like `wallet-connect.service.ts` remain large. |
| **O - Open/Closed** | Good in matching | Strategies and observers remain the strongest extension point pattern in the codebase. |
| **L - Liskov Substitution** | No violations found | No problematic inheritance chains detected. |
| **I - Interface Segregation** | Mostly good | Port interfaces are focused, but some read-model dependencies still leak entity concerns across modules. |
| **D - Dependency Inversion** | Advancing | Most business modules now wire through ports/tokens at their boundaries; remaining work is reducing direct TypeORM entity coupling in application/domain logic. |

---

## 2. Gap Analysis Summary

| Pattern | Current Score | Target |
|---------|:------------:|:------:|
| Clean Architecture | 15/22 module boundaries clean | All business modules fully layered |
| DDD - Aggregates, Value Objects | 20% | Core aggregates defined and adopted |
| DDD - Domain Events & Dispatcher | 20% | Cross-module domain event bus adoption |
| Async Tasks / Schedulers | 75% | All async work through resilient queues |
| Worker Pool | 25% | CPU-heavy ops offloaded where needed |
| Unit of Work | 40% | Formal UoW used in sensitive flows |
| CQS / CQRS | 90% | All business modules follow CQS consistently |
| Observability (OpenTelemetry) | 40% | Full traces + metrics + structured logs |
| SOLID | 88% | Remaining large services decomposed |

---

## 3. Improvement Plan

### Phase 1: Foundation - Infrastructure Building Blocks (Priority: HIGH)

#### 1.1 Domain Event Bus & Dispatcher ✅ DONE
**Goal:** Enable cross-module communication through domain events instead of direct service imports.

**Tasks:**
- [x] Create `src/common/domain-events/domain-event.base.ts` - base class with `eventId`, `occurredOn`, `aggregateId`
- [x] Create `src/common/domain-events/domain-event-dispatcher.ts` - wraps `EventEmitter2` with typed publish/subscribe
- [x] Define initial domain events:
  - `OrderCreatedEvent`, `OrderCancelledEvent`, `TradeExecutedEvent`
  - `DepositConfirmedEvent`, `WithdrawalCompletedEvent`
  - `WalletBalanceChangedEvent`
- [x] Create `@DomainEventHandler()` decorator for clean handler registration
- [x] Migrate `matching` event storage to also publish through the domain event bus
- [ ] Replace direct cross-module calls with event-driven communication where appropriate

#### 1.2 OpenTelemetry Observability Stack ✅ FOUNDATION DONE
**Goal:** Full distributed tracing, metrics, and structured logging.

**Tasks:**
- [x] Install OTel packages and Prometheus support
- [x] Create `src/telemetry/tracing.ts`
- [x] Create `src/telemetry/telemetry.module.ts`
- [x] Create `src/telemetry/metrics.service.ts`
- [x] Upgrade `HealthModule` with Terminus DB readiness
- [x] Add `CorrelationIdMiddleware`
- [x] Wire telemetry + correlation into `AppModule`
- [ ] Add custom spans for critical paths
- [ ] Replace Nest logger with structured JSON logging
- [ ] Add Redis + Bull health indicators

#### 1.3 Unit of Work Pattern ✅ FOUNDATION DONE
**Goal:** Formalize atomic transaction boundaries for multi-repository operations.

**Tasks:**
- [x] Create `UNIT_OF_WORK` port + TypeORM implementation + module
- [ ] Refactor sensitive flows to use UoW consistently
- [ ] Ensure domain events dispatch after commit / evaluate outbox pattern

---

### Phase 2: DDD Core - Domain Model Enrichment (Priority: HIGH)

#### 2.1 Aggregate Root & Entity Base Classes ✅ DONE
**Tasks:**
- [x] Create `aggregate-root.base.ts`, `entity.base.ts`, `value-object.base.ts`
- [x] Add shared value objects `Money`, `TradingPair`, `BlockchainAddress`
- [x] Add branded ID primitives in `src/common/ddd/primitives.ts`

#### 2.2 Bounded Context Isolation 🚧 IN PROGRESS
**Tasks:**
- [x] Move blockchain-owned entities from shared `src/entities/` into `src/modules/blockchain/entities/`
- [x] Add explicit public barrel for `blockchain` and reduce public surface to DTOs, ports, queries, use-cases, and persistence contracts
- [x] Normalize `blockchain/` folder structure into `application/use-cases|queries`, `domain/services|ports`, `infrastructure/providers|persistence`
- [x] Normalize `matching/` boundary into `application/use-cases`, `domain/services|ports`, `infrastructure/*`
- [ ] Replace remaining cross-module entity imports with read-only DTOs or ACL adapters
- [ ] Define the same explicit public API boundary for all remaining business modules

---

### Phase 3: CQS / CQRS Standardization (Priority: MEDIUM)

#### 3.1 CQS Base Types ✅ DONE
**Tasks:**
- [x] Create shared CQRS base types in `src/common/cqrs/`
- [x] Standardize business module handlers around those types
- [ ] Install `@nestjs/cqrs` if full buses are later needed
- [ ] Route controllers through `CommandBus` / `QueryBus` only if complexity justifies it

#### 3.2 Read Model Separation (Optional)
**Tasks:**
- [ ] Evaluate cached/materialized read models for order book, ticker, and admin dashboards

---

### Phase 4: Complete Clean Architecture Migration (Priority: MEDIUM)

#### 4.1 Hybrid Module Migration

| Module | Status | Notes |
|--------|--------|-------|
| `blockchain` | **DONE at boundary** | Folder structure normalized; root services moved into application/domain/infrastructure layers; public API cleaned up |
| `matching` | **DONE at boundary** | Engine internals still service-centric, but root-module leakage was removed and public boundary now goes through application/use-cases |
| `treasury` | **DONE** | Split into application queries/use-cases |
| `currencies` | **DONE** | |
| `users` | **DONE** | |
| `deposits` | **DONE** | |
| `exchange-rate` | **DONE** | |
| `system-config` | **DONE** | |
| `markets` | **DONE** | |
| `managed-wallets` | **DONE** | |
| `notifications` | **DONE** | |
| `payment-config` | **DONE** | |
| `market-maker` | **DONE** | |

**Remaining architectural work in this phase:**
- [ ] Remove thin compatibility facades that still exist only for transitional wiring
- [ ] Reduce direct TypeORM entity usage inside application/domain logic
- [ ] Continue decomposing large remaining services such as `wallet-connect.service.ts`

---

### Phase 5: Worker Pool & Async Resilience (Priority: LOW-MEDIUM)

#### 5.1 Worker Pool for CPU-Intensive Tasks
**Tasks:**
- [x] Install and wire Piscina worker pool support
- [x] Offload treasury crypto account generation into worker threads
- [ ] Move additional heavy reporting/reconciliation workloads if they appear

#### 5.2 Async Task Resilience ✅ MOSTLY DONE
**Tasks:**
- [x] Reusable Redis distributed lock utility
- [x] Schedulers confirmed to use distributed locking
- [x] Bull Board dashboard at `/admin/queues`
- [x] DLQ-friendly Bull retention already in place

---

### Phase 6: Testing Infrastructure (Priority: MEDIUM)

**Tasks:**
- [x] Add targeted sensitive-flow integration/spec coverage for matching and blockchain regressions during migration
- [ ] Add broader integration tests with real DB where valuable
- [ ] Add contract tests for domain ports
- [ ] Raise domain-layer coverage toward 90%+
- [ ] Add end-to-end tests for order -> match -> trade -> wallet credit

---

## 4. Priority & Dependency Matrix

```text
Phase 1 foundation ───────┐
Phase 2 DDD base classes  ├──> Phase 4 module migration / cleanup
Phase 3 CQS standard      ┘

Phase 2.2 bounded contexts ──> deeper DDD aggregates / ACLs
Phase 5 worker pool        ──> operational hardening
Phase 6 testing            ──> continuous verification
```

**Recommended next execution order:**
1. Finish Phase 2.2 ACL/read-model replacement for cross-module entity references
2. Identify true aggregate roots for `orders`, `matching`, `wallets`, and `blockchain`
3. Reduce direct TypeORM entity dependence inside application/domain layers
4. Add UoW + post-commit event handling to the most sensitive multi-step flows
5. Continue operational hardening (custom tracing, structured logs, queue/Redis health)

---

## 5. Architectural Decision Records (ADRs) Needed

| ADR | Decision |
|-----|----------|
| ADR-001 | Domain Event Bus: `@nestjs/event-emitter` vs `@nestjs/cqrs` EventBus vs custom |
| ADR-002 | CQRS scope: lightweight CQS vs full CQRS with separate read DB |
| ADR-003 | Entity ownership and ACL strategy across bounded contexts |
| ADR-004 | OpenTelemetry exporter target |
| ADR-005 | Structured logging stack |
| ADR-006 | Worker pool strategy |
| ADR-007 | Unit of Work adoption style |

---

## 6. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Entity relocation breaks imports across modules | HIGH | Keep public barrels stable, migrate one bounded context at a time, add ACL/read DTOs before removing shared shapes |
| CQRS adds complexity without value | MEDIUM | Keep current lightweight CQS approach unless clear scale pressure appears |
| OpenTelemetry overhead in production | LOW | Control sampling and exporters by environment |
| Domain event ordering / consistency | MEDIUM | Introduce post-commit dispatch or outbox for critical flows |
| Large refactors disrupt active development | HIGH | Preserve build-green milestones and keep module public boundaries explicit |

---

## 7. Implementation Progress Log

### Session 2026-04-16

**Foundation and first migrations:**
- Added shared domain-event infrastructure and initial event types
- Added telemetry bootstrap, metrics module, Terminus readiness, and correlation ID middleware
- Added shared Unit of Work abstraction and TypeORM implementation
- Added DDD base classes and branded ID primitives
- Migrated `system-config`, `currencies`, and `deposits` to explicit application/use-case/query layers
- Added worker-pool infrastructure with Piscina and treasury crypto account worker
- Added reusable Redis distributed lock utility and Bull Board dashboard

### Session 2026-04-17

**Broader Clean Architecture migration:**
- Fixed build issues caused by `tsconfig.json` deprecation setting and several query typing mismatches
- Migrated `users`, `exchange-rate`, `managed-wallets`, `notifications`, `payment-config`, and `market-maker` to clean application layers
- Decomposed `markets` and `treasury` into application queries/use-cases
- Moved blockchain-owned entities into `src/modules/blockchain/entities/` and updated TypeORM wiring/imports

**Matching boundary hardening:**
- Introduced application-facing matching use-cases for enqueue/run/reconcile/remove-order behavior
- Moved matching queue, observers, projections, and engine-related services out of the root module layout
- Reduced public exports of internal matching services and kept the module boundary application-first

**Blockchain boundary hardening:**
- Moved blockchain orchestration services under `application/use-cases` and `application/queries`
- Kept policy/helper behavior under `domain/services`
- Kept repositories and chain providers under `infrastructure/persistence` and `infrastructure/providers`
- Fixed post-refactor repository/DTO mismatches so blockchain linking and withdrawal wiring compile again
- Added a narrower public barrel for `blockchain` that exposes ports, DTOs, queries, use-cases, provider factory, and persistence contracts while keeping internal orchestration services out of the public API

**Verification:**
- `npm run build` ✅ after matching rescue and blockchain boundary cleanup

---

## 8. Current Truth Snapshot

**Done:**
- Foundation work for domain events, telemetry, UoW, DDD base classes
- Clean Architecture migrations for most business modules
- Matching boundary cleanup
- Blockchain folder normalization and public API cleanup foundation

**Not done yet:**
- Comprehensive DDD aggregate modeling
- Full ACL/read-model replacement for cross-module entity imports
- Broad domain event adoption across modules
- Full structured logging and custom critical-path tracing
- Final cleanup of all transitional facades and entity leakage
