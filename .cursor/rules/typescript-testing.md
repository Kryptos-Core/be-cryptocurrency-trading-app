---
paths:
  - "**/*.ts"
  - "**/*.js"
  - "**/*.spec.ts"
  - "**/*.e2e-spec.ts"
---
# NestJS Testing

> This file extends [common/testing.md](../common/testing.md) with NestJS-specific testing patterns.
> Lưu ý: Repo này KHÔNG dùng Playwright. E2E testing dùng supertest qua NestJS test module.

## Test Setup

```typescript
// orders/orders.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let walletsService: jest.Mocked<WalletsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrderRepository, useValue: { create: jest.fn(), findById: jest.fn() } },
        { provide: WalletsService, useValue: { reserveBalance: jest.fn() } },
        { provide: getQueueToken('orders'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(OrdersService);
    orderRepository = module.get(OrderRepository);
    walletsService = module.get(WalletsService);
  });
```

## Unit Tests — Service Layer

```typescript
  it('creates order and reserves balance', async () => {
    // Arrange
    const userId = 'user-123';
    const dto: CreateOrderDto = { side: OrderSide.BUY, type: OrderType.LIMIT, quantity: 0.1, price: 50000 };
    const mockOrder = { id: 'order-1', ...dto, userId, status: OrderStatus.PENDING };
    orderRepository.create.mockResolvedValue(mockOrder);

    // Act
    const result = await service.createOrder(userId, dto);

    // Assert
    expect(walletsService.reserveBalance).toHaveBeenCalledWith(userId, expect.any(Number));
    expect(result.id).toBe('order-1');
  });

  it('throws ConflictException when balance insufficient', async () => {
    walletsService.reserveBalance.mockRejectedValue(new InsufficientBalanceError());
    await expect(service.createOrder('user-1', dto)).rejects.toThrow(ConflictException);
  });
```

## Integration Tests — Controller (supertest)

```typescript
// orders/orders.controller.spec.ts
import * as request from 'supertest';

describe('OrdersController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OrderRepository)
      .useValue(mockOrderRepository)
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('POST /orders — 201 created', async () => {
    const dto = { side: 'BUY', type: 'LIMIT', quantity: 0.001, price: 50000 };
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${mockJwt}`)
      .send(dto)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBeDefined();
  });

  it('POST /orders — 400 invalid DTO', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${mockJwt}`)
      .send({ side: 'INVALID' })
      .expect(400);
  });

  it('POST /orders — 401 without auth', async () => {
    await request(app.getHttpServer()).post('/api/v1/orders').send(dto).expect(401);
  });
});
```

## Testing Guards và Pipes

```typescript
describe('RolesGuard', () => {
  it('blocks non-admin from admin endpoints', () => {
    const guard = new RolesGuard(reflector);
    const context = createMockExecutionContext({ role: UserRole.USER });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(context)).toBe(false);
  });
});

describe('ValidationPipe', () => {
  it('strips unknown fields', async () => {
    const pipe = new ValidationPipe({ whitelist: true });
    const result = await pipe.transform({ side: 'BUY', unknownField: 'x' }, { type: 'body', metatype: CreateOrderDto });
    expect(result).not.toHaveProperty('unknownField');
  });
});
```

## Testing Bull Queue Processors

```typescript
describe('OrderProcessor', () => {
  it('processes match job', async () => {
    const matchingService = { processOrder: jest.fn().mockResolvedValue(undefined) };
    const processor = new OrderProcessor(matchingService as any);
    const job = { data: { orderId: 'order-123' } } as Job<any>;

    await processor.handleMatch(job);

    expect(matchingService.processOrder).toHaveBeenCalledWith('order-123');
  });
});
```

## Mocking ConfigService

```typescript
const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      'JWT_SECRET': 'test-secret',
      'REDIS_HOST': 'localhost',
    };
    return config[key];
  }),
};
```

## Database Fixtures và Cleanup

```typescript
// test/fixtures/order.fixture.ts
export const createOrderFixture = (overrides: Partial<Order> = {}): Order => ({
  id: faker.string.uuid(),
  userId: faker.string.uuid(),
  side: OrderSide.BUY,
  type: OrderType.LIMIT,
  quantity: 0.001,
  price: 50000,
  status: OrderStatus.PENDING,
  createdAt: new Date(),
  ...overrides,
});

// Trong beforeEach/afterEach:
beforeEach(async () => {
  await dataSource.query('DELETE FROM orders WHERE user_id = $1', [testUserId]);
});
```

## E2E Test File Naming

- Unit tests: `*.spec.ts` trong cùng folder với source file
- Integration tests (controller): `*.controller.spec.ts`
- E2E tests: `test/*.e2e-spec.ts`

## Coverage Requirements

- **80% minimum** cho tất cả modules
- **100% required** cho: `matching/`, `orders/` (business logic paths), payment flows
- Exclude: `*.module.ts`, `main.ts`, migration files, seed files

## Agent Support

- **tdd-guide** — enforce RED → GREEN → REFACTOR
- **code-reviewer** — review sau khi viết test
- Không dùng Playwright trong repo này (FE-only tool)
