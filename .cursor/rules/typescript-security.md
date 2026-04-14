---
paths:
  - "**/*.ts"
  - "**/*.js"
---
# TypeScript/NestJS Security

> This file extends [common/security.md](../common/security.md) with NestJS and crypto trading app specifics.

## Secret Management

```typescript
// KHÔNG BAO GIỜ hardcode secrets
const jwtSecret = 'my-secret-key';           // BAD
const rpcUrl = 'https://eth-mainnet.xxxxx';  // BAD

// LUÔN dùng ConfigService (với env validation)
@Injectable()
export class SomeService {
  constructor(private config: ConfigService) {}

  getJwtSecret(): string {
    return this.config.get<string>('JWT_SECRET');
  }
}
```

Biến môi trường mới phải đăng ký trong `src/config/env.validation.ts` (class-validator schema).

## Input Validation — OWASP API Top 10

### A1: Broken Object Level Authorization

```typescript
// BAD: Tin tưởng user-supplied ID
@Get(':id')
async getOrder(@Param('id') id: string) {
  return this.ordersService.findById(id); // Bất kỳ order nào!
}

// GOOD: Enforce ownership
@Get(':id')
async getOrder(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
  return this.ordersService.findByIdAndUserId(id, user.id); // Chỉ order của user
}
```

### A2: Broken Authentication

```typescript
// LUÔN sử dụng JwtAuthGuard trên mọi endpoint cần xác thực
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {}

// JWT phải có expiry ngắn
// access_token: 15m, refresh_token: 7d
```

### A3: Broken Object Property Level Authorization

```typescript
// BAD: Trả về toàn bộ entity (có thể leak hash mật khẩu, key nội bộ)
return user;

// GOOD: Trả về DTO rõ ràng
return plainToClass(UserResponseDto, user, { excludeExtraneousValues: true });
```

### A5: Broken Function Level Authorization

```typescript
// Dùng RBAC decorator trên mọi endpoint admin
@Post('admin/force-cancel')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
async forceCancelOrder(@Param('id') id: string) {}
```

### A8: Security Misconfiguration

```typescript
// main.ts — cấu hình security bắt buộc
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,          // Strip unknown properties
  forbidNonWhitelisted: true, // Throw on unknown properties
  transform: true,
}));
app.use(helmet());
app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') });
```

## SQL Injection Prevention

```typescript
// BAD: Raw query với string interpolation
const orders = await dataSource.query(
  `SELECT * FROM orders WHERE user_id = '${userId}'`
);

// GOOD: Parameterized queries
const orders = await dataSource.query(
  'SELECT * FROM orders WHERE user_id = $1',
  [userId]
);

// GOOD: TypeORM query builder (auto-parameterized)
const orders = await this.repo.createQueryBuilder('order')
  .where('order.userId = :userId', { userId })
  .getMany();
```

## Rate Limiting

```typescript
// Áp dụng throttle trên toàn bộ app
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },   // 10 req/s
      { name: 'long', ttl: 60000, limit: 100 },  // 100 req/min
    ]),
  ],
})

// Override cho endpoint nhạy cảm (auth)
@Throttle({ short: { limit: 3, ttl: 60000 } }) // 3 login attempts/min
@Post('auth/login')
async login() {}
```

## Redis Lock Safety (Matching Engine)

```typescript
// PHẢI dùng Lua script cho atomic lock operations
// KHÔNG dùng SETNX + EXPIRE riêng biột (race condition)
const luaScript = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;
await redis.eval(luaScript, 1, lockKey, lockValue);
```

## Không Leak Error Details

```typescript
// BAD: Leak internal error details
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    response.json({ message: exception.message, stack: exception.stack }); // NGUY HIỂM
  }
}

// GOOD: Log chi tiết nội bộ, trả về message chung cho client
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    this.logger.error(exception); // Chi tiết trong logs
    response.json({ success: false, error: 'Internal server error' }); // Chung chung cho client
  }
}
```

## Blockchain / Private Key

```typescript
// KHÔNG bao giờ log private key, seed phrase, hay raw transaction
this.logger.log(`Broadcasting tx for user ${userId}`); // GOOD
this.logger.log(`Private key: ${privKey}`);            // BAD — never

// Wallet operations phải trong try-catch với audit log
try {
  const txHash = await this.blockchainService.broadcast(signedTx);
  await this.auditLog.record({ userId, action: 'broadcast', txHash });
} catch (error) {
  await this.auditLog.record({ userId, action: 'broadcast_failed', error: error.message });
  throw error;
}
```

## Agent Support

- **security-reviewer** — OWASP vulnerability scan
- **ecc:security-review** — Pre-commit security scan
