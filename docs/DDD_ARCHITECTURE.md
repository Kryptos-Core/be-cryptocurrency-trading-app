# Domain-Driven Design (DDD) Architecture Guide

> **Mục tiêu:** Tài liệu này giúp developer hiểu kiến trúc DDD của dự án, biết nên viết code từ đâu và viết như thế nào.

---

## Table of Contents

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Cấu Trúc Thư Mục](#2-cấu-trúc-thư-mục)
3. [Các Bounded Contexts](#3-các-bounded-contexts)
4. [Layers trong Module](#4-layers-trong-module)
5. [Các Pattern Cốt Lõi](#5-các-pattern-cốt-lõi)
6. [Luồng Xử Lý Feature](#6-luồng-xử-lý-feature)
7. [Quy Tắc Module Boundary](#7-quy-tắc-module-boundary)
8. [Convention & Naming](#8-convention--naming)
9. [Bắt Đầu Viết Code](#9-bắt-đầu-viết-code)

---

## 1. Tổng Quan Kiến Trúc

Dự án sử dụng **Hybrid DDD** kết hợp:

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│              (Controllers, DTOs, API Endpoints)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                       │
│         (Use Cases, Commands, Queries, Application Services)│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                          │
│    (Aggregates, Entities, Value Objects, Domain Services)   │
│                         (Pure Logic - No Dependencies)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE LAYER                       │
│        (Repository Implementations, External Adapters)      │
│                   (TypeORM, Redis, External APIs)            │
└─────────────────────────────────────────────────────────────┘
```

**Nguyên tắc vàng:**
- **Domain Layer** = Pure business logic, không phụ thuộc framework gì
- **Application Layer** = orchestration, gọi domain services
- **Infrastructure Layer** = implementation chi tiết (DB, external APIs)
- **Presentation Layer** = HTTP handlers, serialization

---

## 2. Cấu Trúc Thư Mục

```
src/
├── main.ts                           # Entry point
├── app.module.ts                     # Root module
├── config/                          # Configuration
├── entities/                        # TypeORM entities (34 files)
├── migrations/                      # Database migrations
├── modules/                         # Bounded Contexts (25 modules)
│   ├── auth/
│   ├── users/
│   ├── orders/
│   ├── matching/
│   ├── trading/
│   ├── wallets/
│   ├── markets/
│   ├── blockchain/
│   ├── treasury/
│   └── ... (20 modules khác)
├── common/                          # Shared Infrastructure
│   ├── ddd/                        # DDD base classes
│   ├── repositories/               # Base repository
│   ├── application-bus/           # CQRS bus
│   ├── cqrs/                      # Commands & Queries
│   ├── domain-events/              # Domain events
│   ├── integration-events/          # Integration events
│   ├── outbox/                    # Transactional outbox
│   ├── unit-of-work/              # Transaction wrapper
│   ├── read-model/                # CQRS read models
│   ├── services/                  # Shared services
│   └── ... (31 folders)
└── telemetry/                      # OpenTelemetry
```

---

## 3. Các Bounded Contexts

Dự án có **9 Bounded Contexts chính**:

| Context | Modules | Mô tả |
|---------|---------|--------|
| **Identity & Access** | `auth`, `users` | User accounts, sessions, tokens |
| **Markets** | `markets` | Market pairs, tickers |
| **Trading & Matching** | `orders`, `matching`, `trading` | Orders, order book, trades |
| **Wallets & Ledger** | `wallets`, `managed-wallets` | Balances, ledger entries |
| **Blockchain** | `blockchain`, `exchange`, `user-binance-credentials` | On-chain transactions, withdrawals |
| **Treasury** | `treasury`, `treasury-e2e-config` | Main wallets, treasury operations |
| **Payments & Fiat** | `deposits`, `payment-config` | Fiat deposits, payment methods |
| **Platform Config** | `system-config`, `currencies`, `exchange-rate` | Runtime settings, exchange rates |
| **Notifications** | `notifications` | User notifications, FCM tokens |

---

## 4. Layers trong Module

### 4.1 Cấu trúc chi tiết của một Module

```
src/modules/<module-name>/
├── dto/                              # Data Transfer Objects (Request/Response)
│   ├── create-xxx.dto.ts
│   ├── update-xxx.dto.ts
│   └── xxx-response.dto.ts
├── application/                      # APPLICATION LAYER
│   ├── use-cases/                   # Use case implementations
│   │   ├── create-xxx.use-case.ts
│   │   ├── update-xxx.use-case.ts
│   │   └── delete-xxx.use-case.ts
│   ├── queries/                     # Query handlers (CQRS)
│   │   ├── get-xxx.query.ts
│   │   └── list-xxx.query.ts
│   ├── services/                    # Application services
│   │   └── xxx.service.ts
│   ├── ports/                       # Port interfaces (INPUT ports)
│   │   └── xxx-application.port.ts
│   └── utils/                       # Utilities
│       └── xxx-mapper.util.ts
├── domain/                          # DOMAIN LAYER (Pure logic)
│   ├── aggregates/                  # Aggregate roots
│   │   └── xxx.aggregate.ts
│   ├── entities/                    # Domain entities
│   │   └── xxx.entity.ts
│   ├── ports/                       # Port interfaces (OUTPUT ports - contracts)
│   │   ├── xxx-repository.port.ts
│   │   └── xxx-gateway.port.ts
│   ├── services/                    # Domain services
│   │   └── xxx-validation.service.ts
│   └── value-objects/               # Value objects
│       ├── xxx-id.vo.ts
│       └── xxx-amount.vo.ts
├── infrastructure/                  # INFRASTRUCTURE LAYER
│   ├── persistence/               # Repository implementations
│   │   └── xxx.repository.impl.ts
│   ├── adapters/                   # External adapters
│   │   ├── xxx-api.adapter.ts
│   │   └── xxx-sdk.adapter.ts
│   └── providers/                  # Dependency Injection providers
│       └── xxx.providers.ts
├── controllers/                     # PRESENTATION LAYER
│   └── xxx.controller.ts
├── strategies/                     # Strategy patterns
├── commands/                       # Command definitions (CQRS)
│   └── create-xxx.command.ts
├── states/                         # State machines
└── utils/                          # Module utilities
```

### 4.2 Sơ đồ phân cấp responsibility

```
┌──────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER (Controllers)                            │
│  ├── Parse HTTP request                                     │
│  ├── Validate request format (class-validator)               │
│  ├── Call Application Layer                                │
│  └── Serialize response                                    │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  APPLICATION LAYER (Use Cases, Services)                    │
│  ├── Orchestrate domain logic                              │
│  ├── Handle transactions (UnitOfWork)                      │
│  ├── Emit domain events                                    │
│  └── Call Infrastructure (via Ports)                       │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  DOMAIN LAYER (Aggregates, Entities, Services)               │
│  ├── Pure business logic                                   │
│  ├── Business invariants validation                        │
│  ├── Domain events collection                              │
│  └── NO dependencies on infrastructure                     │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER (Repository Impl, Adapters)            │
│  ├── Implement ports/interfaces                            │
│  ├── Database operations (TypeORM)                         │
│  ├── External API calls                                     │
│  └── Third-party SDK integration                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Các Pattern Cốt Lõi

### 5.1 Repository Pattern

**Interface (Port):** Định nghĩa trong `domain/ports/`

```typescript
// src/modules/orders/domain/ports/order-repository.port.ts
export interface OrderRepositoryPort {
  findById(id: string): Promise<Order | null>;
  findByUserIdempotency(userId: string, idempotencyKey: string): Promise<Order | null>;
  getOrderBook(pairId: string, side: 'BUY' | 'SELL', limit?: number): Promise<OrderBookLevel[]>;
  createOrderViaProcedure(params: CreateOrderParams): Promise<CreateOrderProcedureResult>;
  // ...
}
```

**Implementation:** Trong `infrastructure/persistence/`

```typescript
// src/modules/wallets/infrastructure/persistence/wallet.repository.impl.ts
export class WalletRepositoryImpl extends BaseRepository<Wallet> implements WalletRepositoryPort {
  constructor(dataSource: DataSource) {
    super(Wallet, dataSource);
  }
  // Implement các methods từ Port
}
```

**Base Repository:** Cung cấp CRUD + transaction + pagination

```typescript
// src/common/repositories/base.repository.ts
export abstract class BaseRepository<T extends ObjectLiteral> implements IRepository<T> {
  protected _repository: Repository<T> | null = null;
  protected readonly dataSource: DataSource;

  async findById(id: number | string): Promise<T | null> { ... }
  async findWithPagination(...): Promise<{ data: T[]; total: number; page: number; limit: number }> { ... }
  async transaction<R>(fn: (ctx: TransactionContext) => Promise<R>): Promise<R> { ... }
}
```

### 5.2 Aggregate Root Pattern

**Base Class:** Trong `common/ddd/aggregate-root.base.ts`

```typescript
// src/common/ddd/aggregate-root.base.ts
export abstract class AggregateRoot {
  private readonly _domainEvents: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  public pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents.length = 0;
    return events;
  }
}
```

**Example Aggregate:** Trong `domain/aggregates/`

```typescript
// src/modules/orders/domain/aggregates/order-placement-draft.aggregate.ts
export class OrderPlacementDraftAggregate extends AggregateRoot {
  private constructor(
    public readonly orderId: string,
    public readonly pairId: string,
    public readonly side: OrderPlacementSide,
    private _amount: string,
  ) { super(); }

  static create(input: CreateOrderInput): OrderPlacementDraftAggregate {
    // Business invariants
    const n = Number(input.amount);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('ORDER_AMOUNT_MUST_BE_POSITIVE');
    }
    return new OrderPlacementDraftAggregate(...);
  }

  // Domain methods
  calculateTotal(price: string): string { ... }
}
```

### 5.3 Domain Events Pattern

**Base Event:** Trong `common/domain-events/base.event.ts`

```typescript
// src/common/domain-events/base.event.ts
export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly occurredOn: Date;

  constructor() {
    const now = Date.now();
    this.eventId = `${now.toString(36)}-${DomainEvent._counter.toString(36).padStart(4, '0')}`;
    this.occurredOn = new Date();
  }
}
```

**Domain Event Definition:**

```typescript
// src/modules/orders/domain/events/order-placed.event.ts
export class OrderPlacedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly pairId: string,
    public readonly side: OrderPlacementSide,
    public readonly amount: string,
  ) { super(); }
}
```

### 5.4 Port Interface Pattern (Hexagonal Architecture)

**Anti-Corruption Layer (ACL):** Modules giao tiếp qua Ports, không import trực tiếp nhau.

```typescript
// src/modules/orders/domain/ports/order-matching-gateway.port.ts
export const ORDER_MATCHING_GATEWAY = Symbol('ORDER_MATCHING_GATEWAY');

export interface OrderMatchingGatewayPort {
  enqueueMatch(input: { orderId: string; pairId: string }): Promise<void>;
  removeOrderFromBook(pairId: string, orderId: string, side: 'BUY' | 'SELL'): Promise<boolean>;
  reconcileOpenOrdersForPair(input: { pairId: string }): Promise<MatchingReconcileResultSnapshot>;
}
```

### 5.5 Unit of Work Pattern

**Transaction Wrapper:** Đảm bảo consistency

```typescript
// src/common/unit-of-work/unit-of-work.ts
@Injectable()
export class UnitOfWork {
  async run<T>(callback: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    const tracer = trace.getTracer('be-cryptocurrency-trading-app');
    return await tracer.startActiveSpan('UnitOfWork.run', async (span) => {
      try {
        return await this.dataSource.transaction(async (manager) => {
          const ctx: TransactionContext = manager as unknown as TransactionContext;
          return await callback(ctx);
        });
      } finally { span.end(); }
    });
  }
}
```

### 5.6 Transactional Outbox Pattern

Đảm bảo **at-least-once delivery** cho integration events.

```typescript
// src/common/outbox/outbox-appender.service.ts
@Injectable()
export class OutboxAppender {
  async append(manager: EntityManager, input: AppendIntegrationOutboxInput): Promise<void> {
    const envelope = buildCanonicalIntegrationEventEnvelope({
      eventType: input.eventType,
      payload: input.payload,
    });
    const row = manager.create(IntegrationOutbox, {
      eventId: envelope.id,
      eventType: envelope.eventType,
      payload: envelope.payload,
      partitionKey: input.partitionKey,
      createdAt: new Date(),
    });
    await manager.save(IntegrationOutbox, row);
  }
}
```

### 5.7 CQRS Pattern

**Application Bus:** Điều phối Commands và Queries

```typescript
// src/common/application-bus/application-bus.service.ts
@Injectable()
export class ApplicationBusService {
  constructor(
    readonly commands: CommandBus,
    readonly queries: QueryBus,
  ) {}

  executeCommand<TResult = void, TCommand extends ICommand = ICommand>(
    command: TCommand,
  ): Promise<TResult> {
    return this.commands.execute(command) as Promise<TResult>;
  }

  executeQuery<TResult, TQuery extends IQuery = IQuery>(
    query: TQuery,
  ): Promise<TResult> {
    return this.queries.execute(query) as Promise<TResult>;
  }
}
```

**Command Definition:**

```typescript
// src/modules/orders/commands/create-order.command.ts
export class CreateOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: CreateOrderDto,
  ) {}
}
```

**Query Definition:**

```typescript
// src/modules/orders/queries/get-order.query.ts
export class GetOrderQuery {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
  ) {}
}
```

### 5.8 Read Model Pattern (CQRS Read Side)

```typescript
// src/common/read-model/read-model-projector.port.ts
export interface ReadModelProjector<TPayload = unknown> {
  readonly eventType: string;
  project(payload: TPayload, ctx: ReadModelProjectorContext): Promise<void>;
}
```

---

## 6. Luồng Xử Lý Feature

### 6.1 Order Placement Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Controller (OrdersController)                                   │
│    POST /orders                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. CreateOrderUseCase (application/use-cases/)                      │
│    ├── Validate request DTO (class-validator)                       │
│    ├── OrderValidationService (domain/services/)                     │
│    │   └── Validates: amount, price, precision, balance              │
│    └── Wallet lock (within UnitOfWork.run)                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. OrderRepositoryImpl (infrastructure/persistence/)              │
│    └── createOrderViaProcedure() - atomic transaction                │
│        ├── Create order record                                      │
│        ├── Freeze wallet balance                                    │
│        └── Insert ledger entry                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. OutboxAppender.append()                                          │
│    └── Appends order.created event to integration_outbox            │
│        (SAME transaction - guarantees consistency)                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Market Pair Creation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. MarketsService.write() (within UnitOfWork.run)                   │
│    └── TransactionContext with EntityManager                         │
│        ├── MarketsRepository.createWithinTransaction()              │
│        └── OutboxAppender.append()                                  │
│            └── integration_outbox row created (same transaction)    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (async via Bull queue)
┌─────────────────────────────────────────────────────────────────────┐
│ 2. OutboxRelayService.flushOnce()                                   │
│    ├── Acquire distributed lock via Redis                          │
│    ├── Query unpublished rows with pessimistic_write + skip_locked  │
│    └── For each row: dispatchRow()                                  │
│        ├── Update read_market_pairs table (read model)              │
│        └── Send notifications                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 On-Chain Deposit Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. BlockchainModule.submitDeposit()                                 │
│    └── UnitOfWork.run()                                             │
│        ├── Create onchain_transactions row                         │
│        ├── Credit wallet balance (WalletsService)                    │
│        └── OutboxAppender.append(OnchainDeposit.Submitted@v1)      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (async)
┌─────────────────────────────────────────────────────────────────────┐
│ 2. OutboxRelayService (dispatchRow)                                │
│    ├── Update read_onchain_deposits (read model)                   │
│    └── Send notification to user                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Quy Tắc Module Boundary

### 7.1 Dependency Rules

```
✅ ĐƯỢC PHÉP:
   - Module → common/ (shared infrastructure)
   - Module → domain/ của chính nó
   - Module → application/ của chính nó
   - Module → infrastructure/ của chính nó
   - Module → domain/ports/ của module KHÁC (interfaces only)
   - Module → dto/ của module KHÁC (for API contracts)

❌ KHÔNG ĐƯỢC PHÉP:
   - Module → application/ của module KHÁC (violates encapsulation)
   - Module → infrastructure/ của module KHÁC
   - Module → controllers/ của module KHÁC
```

### 7.2 Kiểm tra tự động

```bash
npm run lint:boundaries
```

Lệnh này verify rằng modules không import trực tiếp nhau sai quy tắc.

---

## 8. Convention & Naming

### 8.1 File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Entity | `*.entity.ts` | `order.entity.ts` |
| Value Object | `*.vo.ts` | `order-id.vo.ts` |
| Aggregate | `*.aggregate.ts` | `order-placement.aggregate.ts` |
| Repository Port | `*-repository.port.ts` | `order-repository.port.ts` |
| Repository Impl | `*.repository.impl.ts` | `order.repository.impl.ts` |
| Gateway Port | `*-gateway.port.ts` | `order-matching-gateway.port.ts` |
| Domain Service | `*.service.ts` | `order-validation.service.ts` |
| Use Case | `*.use-case.ts` | `create-order.use-case.ts` |
| Command | `*.command.ts` | `create-order.command.ts` |
| Query | `*.query.ts` | `get-order.query.ts` |
| DTO | `*.dto.ts` | `create-order.dto.ts` |
| Domain Event | `*.event.ts` | `order-placed.event.ts` |
| Controller | `*.controller.ts` | `order.controller.ts` |

### 8.2 DI Token Naming

```typescript
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
export const MATCHING_GATEWAY = Symbol('MATCHING_GATEWAY');
export const AUTH_SERVICE = Symbol('AUTH_SERVICE');
```

### 8.3 Domain Event Catalog

```typescript
// src/common/integration-events/integration-event-catalog.ts
export const OutboxIntegrationEventType = {
  MarketPairCreatedV1: 'MarketPair.Created@v1',
  MarketPairUpdatedV1: 'MarketPair.Updated@v1',
  OnchainDepositSubmittedV1: 'OnchainDeposit.Submitted@v1',
  OnchainDepositSettledV1: 'OnchainDeposit.Settled@v1',
  OrderCreatedV1: 'order.created',
  OrderCancelledV1: 'order.cancelled',
  TradeExecutedV1: 'trade.executed',
  WalletBalanceChangedV1: 'wallet.balance_changed',
} as const;
```

---

## 9. Bắt Đầu Viết Code

### 9.1 Checklist cho Feature mới

```
□ 1. Xác định Bounded Context (Module)
□ 2. Tạo Domain Entities/Aggregates (domain/)
□ 3. Định nghĩa Ports/Interfaces (domain/ports/)
□ 4. Viết Domain Services (domain/services/)
□ 5. Implement Infrastructure (infrastructure/persistence/)
□ 6. Viết Use Cases (application/use-cases/)
□ 7. Tạo DTOs (dto/)
□ 8. Implement Controller (controllers/)
□ 9. Register Providers (infrastructure/providers/)
□ 10. Viết Unit Tests
□ 11. Chạy lint:boundaries để verify
```

### 9.2 Ví dụ: Tạo một Feature đơn giản

**Bài toán:** Thêm endpoint để lấy danh sách notifications của user.

**Bước 1: Xác định Module**
- Module: `notifications`

**Bước 2: Tạo Domain Entity**

```typescript
// src/modules/notifications/domain/entities/notification.entity.ts
export class Notification {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly title: string,
    public readonly body: string,
    public readonly type: NotificationType,
    public readonly read: boolean,
    public readonly createdAt: Date,
  ) {}

  markAsRead(): Notification {
    return new Notification(
      this.id,
      this.userId,
      this.title,
      this.body,
      this.type,
      true,  // read = true
      this.createdAt,
    );
  }
}
```

**Bước 3: Định nghĩa Port**

```typescript
// src/modules/notifications/domain/ports/notification-repository.port.ts
export interface NotificationRepositoryPort {
  findById(id: string): Promise<Notification | null>;
  findByUserId(userId: string, options?: { limit?: number; offset?: number }): Promise<Notification[]>;
  findUnreadByUserId(userId: string): Promise<Notification[]>;
  countUnreadByUserId(userId: string): Promise<number>;
  create(notification: Notification): Promise<void>;
  update(notification: Notification): Promise<void>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
```

**Bước 4: Implement Repository**

```typescript
// src/modules/notifications/infrastructure/persistence/notification.repository.impl.ts
@Injectable()
export class NotificationRepositoryImpl 
  extends BaseRepository<NotificationEntity> 
  implements NotificationRepositoryPort {
  
  constructor(dataSource: DataSource) {
    super(NotificationEntity, dataSource);
  }

  async findByUserId(
    userId: string, 
    options?: { limit?: number; offset?: number }
  ): Promise<Notification[]> {
    const repo = this.getRepository();
    const entities = await repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: options?.limit,
      skip: options?.offset,
    });
    return entities.map(this.toDomain);
  }

  private toDomain(entity: NotificationEntity): Notification {
    return new Notification(
      entity.id,
      entity.userId,
      entity.title,
      entity.body,
      entity.type,
      entity.read,
      entity.createdAt,
    );
  }
}
```

**Bước 5: Viết Use Case**

```typescript
// src/modules/notifications/application/use-cases/get-user-notifications.use-case.ts
export class GetUserNotificationsInput {
  constructor(
    public readonly userId: string,
    public readonly limit?: number,
    public readonly offset?: number,
  ) {}
}

export class GetUserNotificationsOutput {
  constructor(
    public readonly notifications: Notification[],
    public readonly total: number,
  ) {}
}

export class GetUserNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) 
    private readonly notificationRepo: NotificationRepositoryPort,
  ) {}

  async execute(input: GetUserNotificationsInput): Promise<GetUserNotificationsOutput> {
    const notifications = await this.notificationRepo.findByUserId(
      input.userId,
      { limit: input.limit, offset: input.offset }
    );
    const total = await this.notificationRepo.countByUserId(input.userId);
    
    return new GetUserNotificationsOutput(notifications, total);
  }
}
```

**Bước 6: Tạo DTO**

```typescript
// src/modules/notifications/dto/notification-response.dto.ts
export class NotificationResponseDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly body: string,
    public readonly type: string,
    public readonly read: boolean,
    public readonly createdAt: Date,
  ) {}

  static fromDomain(notification: Notification): NotificationResponseDto {
    return new NotificationResponseDto(
      notification.id,
      notification.title,
      notification.body,
      notification.type,
      notification.read,
      notification.createdAt,
    );
  }
}
```

**Bước 7: Viết Controller**

```typescript
// src/modules/notifications/controllers/notification.controller.ts
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly getUserNotificationsUseCase: GetUserNotificationsUseCase,
  ) {}

  @Get()
  async getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<NotificationResponseDto[]> {
    const output = await this.getUserNotificationsUseCase.execute(
      new GetUserNotificationsInput(user.id, limit, offset)
    );
    return output.notifications.map(NotificationResponseDto.fromDomain);
  }
}
```

**Bước 8: Register Provider**

```typescript
// src/modules/notifications/infrastructure/providers/notification.providers.ts
export const NOTIFICATION_PROVIDERS: Provider[] = [
  {
    provide: NOTIFICATION_REPOSITORY,
    useClass: NotificationRepositoryImpl,
  },
  GetUserNotificationsUseCase,
  NotificationController,
];
```

### 9.3 Best Practices

1. **Domain Layer phải "sạch":**
   - Không import TypeORM decorators
   - Không import NestJS decorators
   - Không gọi trực tiếp infrastructure

2. **Use Case chỉ orchestrate:**
   - Gọi domain services để xử lý business logic
   - Không viết logic nghiệp vụ trong use case

3. **Immutable Objects:**
   - Domain entities nên là immutable
   - Thay đổi → tạo instance mới

4. **Validation tại Boundary:**
   - Request DTO → class-validator
   - Domain invariants → trong Domain entities/aggregates

5. **Error Handling:**
   - Domain errors → custom exceptions
   - Infrastructure errors → wrapped/transformed

---

## Appendix: Common Infrastructure Reference

| Component | Location | Purpose |
|-----------|----------|---------|
| `AggregateRoot` | `common/ddd/aggregate-root.base.ts` | Domain events collection |
| `DomainEvent` | `common/domain-events/base.event.ts` | Base event class |
| `BaseRepository` | `common/repositories/base.repository.ts` | CRUD + pagination |
| `UnitOfWork` | `common/unit-of-work/unit-of-work.ts` | Transaction wrapper |
| `OutboxAppender` | `common/outbox/outbox-appender.service.ts` | Outbox writes |
| `ReadModelProjector` | `common/read-model/read-model-projector.port.ts` | CQRS read side |
| `ApplicationBus` | `common/application-bus/application-bus.service.ts` | CQRS bus |

---

## Quick Reference: Layer Responsibilities

```
┌────────────────────────────────────────────────────────────────────┐
│ CONTROLLER                                                         │
│ • Parse request                                                    │
│ • Call use case                                                    │
│ • Format response                                                  │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ USE CASE                                                           │
│ • Orchestrate flow                                                 │
│ • Transaction management                                           │
│ • Call domain services                                             │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ DOMAIN SERVICE                                                     │
│ • Pure business logic                                              │
│ • Business rules & invariants                                     │
│ • Emit domain events                                               │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ REPOSITORY PORT                                                    │
│ • Interface definition                                             │
│ • No implementation details                                       │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ REPOSITORY IMPL                                                    │
│ • TypeORM operations                                               │
│ • Entity-Domain mapping                                            │
└────────────────────────────────────────────────────────────────────┘
```
