---
paths:
  - "**/*.ts"
  - "**/*.js"
---
# NestJS Patterns

> This file extends [common/patterns.md](../common/patterns.md) with NestJS-specific patterns.

## Module Structure

Mỗi bounded context là 1 module NestJS độc lập:

```typescript
// orders/orders.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderBook]), RedisModule, BullModule.registerQueue({ name: 'orders' })],
  controllers: [OrdersController],
  providers: [OrdersService, OrderRepository, OrderStrategy],
  exports: [OrdersService],
})
export class OrdersModule {}
```

Quy tắc: module chỉ export những gì module khác thực sự cần — không export nội bộ.

## Controller — Thin Controllers

Controller chỉ: validate input, gọi service, trả response. Không chứa business logic.

```typescript
// BAD: business logic trong controller
@Post()
async createOrder(@Body() dto: CreateOrderDto, @Req() req: Request) {
  const balance = await this.walletsService.getBalance(req.user.id);
  if (balance < dto.amount) throw new BadRequestException('Insufficient balance');
  // ... nhiều logic khác
}

// GOOD: delegate hoàn toàn cho service
@Post()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
async createOrder(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtPayload): Promise<ApiResponse<Order>> {
  const order = await this.ordersService.createOrder(user.id, dto);
  return { success: true, data: order };
}
```

## Service Layer

Service chứa business logic, orchestrate repositories và external services:

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly walletsService: WalletsService,
    private readonly matchingQueue: Queue,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto): Promise<Order> {
    // Business logic here
    await this.walletsService.reserveBalance(userId, dto.amount);
    const order = await this.orderRepository.create({ userId, ...dto });
    await this.matchingQueue.add('match', { orderId: order.id });
    return order;
  }
}
```

## Repository Pattern với TypeORM

```typescript
@Injectable()
export class OrderRepository {
  constructor(
    @InjectRepository(Order)
    private readonly repo: Repository<Order>,
  ) {}

  async findActiveByUser(userId: string): Promise<Order[]> {
    return this.repo.find({
      where: { userId, status: In([OrderStatus.PENDING, OrderStatus.PARTIAL]) },
      order: { createdAt: 'DESC' },
    });
  }

  async createWithTransaction(manager: EntityManager, dto: CreateOrderDto): Promise<Order> {
    const order = manager.create(Order, dto);
    return manager.save(order);
  }
}
```

## Custom Decorators

```typescript
// Lấy user từ JWT payload
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | JwtPayload[keyof JwtPayload] => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.user?.[data] : request.user;
  },
);

// Roles decorator
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

## Guards

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
```

## Interceptors

```typescript
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map(data => ({ success: true, data })),
    );
  }
}
```

## API Response Format

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

## DTO Validation

```typescript
export class CreateOrderDto {
  @IsEnum(OrderSide)
  @ApiProperty({ enum: OrderSide })
  side: OrderSide;

  @IsEnum(OrderType)
  @ApiProperty({ enum: OrderType })
  type: OrderType;

  @IsPositive()
  @IsNumber({ maxDecimalPlaces: 8 })
  @ApiProperty({ example: 0.001 })
  quantity: number;

  @IsOptional()
  @IsPositive()
  @IsNumber({ maxDecimalPlaces: 2 })
  @ApiProperty({ required: false })
  price?: number;
}
```

## Bull Queue Processors

```typescript
@Processor('orders')
export class OrderProcessor {
  constructor(private readonly matchingService: MatchingService) {}

  @Process('match')
  async handleMatch(job: Job<{ orderId: string }>): Promise<void> {
    await this.matchingService.processOrder(job.data.orderId);
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error): Promise<void> {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
  }
}
```

## CQRS (cho matching engine)

```typescript
// commands/create-order.command.ts
export class CreateOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: CreateOrderDto,
  ) {}
}

// handlers/create-order.handler.ts
@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  async execute(command: CreateOrderCommand): Promise<Order> {
    // isolated command execution
  }
}
```
