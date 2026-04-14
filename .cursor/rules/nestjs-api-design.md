---
paths:
  - "**/*.ts"
  - "**/*.js"
---
# NestJS API Design

> Chuẩn thiết kế API cho backend giao dịch crypto.
> Extends: [typescript-patterns.md](./typescript-patterns.md)

## Controller Design

### Thin Controller, Thin Routes

```typescript
@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo lệnh mua/bán' })
  @ApiCreatedResponse({ type: OrderResponseDto })
  async createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<OrderResponseDto>> {
    const order = await this.ordersService.createOrder(user.id, dto);
    return { success: true, data: plainToClass(OrderResponseDto, order) };
  }
}
```

**Quy tắc Controller:**
- Không có business logic trong controller
- Mỗi action phương thức tối đa 10 dòng
- Luôn có `@ApiOperation`, `@ApiResponse` cho Swagger
- Trả về `ApiResponse<T>` nhất quán

## API Versioning

```typescript
// main.ts
app.setGlobalPrefix('api');
app.enableVersioning({ type: VersioningType.URI });

// Controller
@Controller({ version: '1', path: 'orders' })
// → /api/v1/orders
```

## Response Format

### Success

```json
{ "success": true, "data": { ... } }
{ "success": true, "data": [...], "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 } }
```

### Error

```json
{ "success": false, "error": "Insufficient balance" }
{ "success": false, "error": "Validation failed", "details": [...] }
```

### Pagination DTO

```typescript
export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiPropertyOptional({ default: 1 })
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @ApiPropertyOptional({ default: 20 })
  limit?: number = 20;
}
```

## DTO Conventions

```typescript
// Mỗi action có DTO riêng — không share CreateDto với UpdateDto
export class CreateOrderDto { /* create-specific fields */ }
export class UpdateOrderDto extends PartialType(CreateOrderDto) { /* partial */ }
export class OrderResponseDto {
  @Expose() id: string;
  @Expose() side: OrderSide;
  @Expose() status: OrderStatus;
  // Không expose: internal fields, audit fields
}
```

## Error Handling

```typescript
// Dùng NestJS built-in exceptions
throw new NotFoundException(`Order ${id} not found`);
throw new BadRequestException('Insufficient balance');
throw new ConflictException('Order already cancelled');
throw new ForbiddenException('Cannot cancel other user orders');
throw new UnprocessableEntityException('Market not active');

// Custom exception cho domain errors
export class InsufficientBalanceException extends BadRequestException {
  constructor(required: number, available: number) {
    super(`Insufficient balance: need ${required}, have ${available}`);
  }
}
```

## WebSocket Gateway

```typescript
@WebSocketGateway({ namespace: '/trading', cors: { origin: process.env.CORS_ORIGIN } })
@UseGuards(WsJwtGuard)
export class TradingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.authService.verifyWsToken(client.handshake.auth.token);
      client.data.userId = user.id;
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('subscribe_orderbook')
  async handleSubscribeOrderbook(client: Socket, @MessageBody() data: SubscribeDto): Promise<void> {
    await client.join(`orderbook:${data.marketId}`);
  }

  broadcastTrade(marketId: string, trade: TradeDto): void {
    this.server.to(`orderbook:${marketId}`).emit('trade', trade);
  }
}
```

## Swagger Documentation

```typescript
// main.ts
const config = new DocumentBuilder()
  .setTitle('Crypto Trading API')
  .setDescription('REST API cho ứng dụng giao dịch crypto')
  .setVersion('1.0')
  .addBearerAuth()
  .addServer(process.env.API_URL, 'Production')
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

Swagger chỉ bật khi `NODE_ENV !== 'production'`.

## File Upload

```typescript
@Post('deposit/proof')
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) {
      return cb(new BadRequestException('Invalid file type'), false);
    }
    cb(null, true);
  },
}))
async uploadProof(@UploadedFile() file: Express.Multer.File) {}
```

## Health Check

```typescript
@Controller('health')
export class HealthController {
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.checkHealth('redis'),
    ]);
  }
}
```
