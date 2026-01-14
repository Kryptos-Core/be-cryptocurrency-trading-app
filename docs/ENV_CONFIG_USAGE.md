# Environment Configuration - Hướng Dẫn Sử Dụng

## Tổng Quan

Environment configuration đã được setup với:
- **Type-safe**: Full TypeScript support với IntelliSense
- **Validation**: Tự động validate environment variables khi app start
- **Builder Pattern**: Config builder để tạo config linh hoạt
- **Singleton Pattern**: Config service được quản lý bởi NestJS

## Cấu Trúc

### Files

1. **`src/config/env.validation.ts`**
   - Environment variables schema
   - Validation với class-validator
   - Type-safe environment variables

2. **`src/config/app.config.ts`**
   - App configuration interface
   - Config builder pattern
   - Factory function để tạo config

3. **`.env.example`**
   - Template cho environment variables
   - Copy thành `.env` và điền giá trị

## Setup

### 1. Tạo file .env

```bash
cp .env.example .env
```

### 2. Điền các giá trị cần thiết

Mở file `.env` và điền các giá trị:

```env
# Required
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_NAME=crypto_trading_db
JWT_SECRET=your-super-secret-jwt-key

# Optional (có default values)
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 3. Validation

Khi app start, environment variables sẽ được tự động validate:
- Nếu thiếu required fields → App sẽ không start
- Nếu format sai → App sẽ không start
- Tất cả errors sẽ được hiển thị rõ ràng

## Sử Dụng Config trong Code

### 1. Inject ConfigService

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@/config';

@Injectable()
export class YourService {
  constructor(private readonly configService: ConfigService) {}

  example() {
    // Access app config namespace
    const appConfig = this.configService.get<AppConfig['app']>('app.app');
    console.log(appConfig.name); // Type-safe!
    console.log(appConfig.port);
    console.log(appConfig.env);

    // Access database config
    const dbConfig = this.configService.get<AppConfig['database']>('app.database');
    console.log(dbConfig.host);

    // Access JWT config
    const jwtConfig = this.configService.get<AppConfig['jwt']>('app.jwt');
    console.log(jwtConfig.secret);
  }
}
```

### 2. Type-safe Access

```typescript
// ✅ Type-safe với IntelliSense
const port = this.configService.get<number>('app.app.port');

// ✅ Hoặc với type assertion
const appConfig = this.configService.get<AppConfig['app']>('app.app');
```

### 3. Direct Environment Access (không khuyến khích)

```typescript
// ❌ Không khuyến khích - không type-safe
const port = process.env.PORT;

// ✅ Nên dùng ConfigService
const port = this.configService.get<number>('app.app.port');
```

## Environment Variables

### Required Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `DB_HOST` | string | Database host | `localhost` |
| `DB_PORT` | string | Database port | `3306` |
| `DB_USERNAME` | string | Database username | `root` |
| `DB_PASSWORD` | string | Database password | `your_password` |
| `DB_NAME` | string | Database name | `crypto_trading_db` |
| `JWT_SECRET` | string | JWT secret key | `your-secret-key` |

### Optional Variables (có defaults)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | enum | `development` | Environment: `development`, `production`, `test` |
| `PORT` | number | `3000` | Application port |
| `APP_NAME` | string | `Cryptocurrency Trading API` | Application name |
| `REDIS_HOST` | string | `localhost` | Redis host |
| `REDIS_PORT` | number | `6379` | Redis port |
| `REDIS_PASSWORD` | string | - | Redis password (optional) |
| `REDIS_DB` | number | `0` | Redis database number (0-15) |
| `JWT_EXPIRATION` | string | `24h` | JWT token expiration |
| `JWT_REFRESH_SECRET` | string | - | JWT refresh secret (optional) |
| `JWT_REFRESH_EXPIRATION` | string | `7d` | Refresh token expiration |
| `CORS_ORIGIN` | string | `*` | CORS allowed origins (comma-separated) |
| `CORS_CREDENTIALS` | boolean | `true` | CORS credentials |
| `LOG_ENABLED` | boolean | `true` | Enable logging |
| `LOG_LEVEL` | enum | `info` | Log level: `error`, `warn`, `info`, `debug`, `verbose` |
| `RATE_LIMIT_TTL` | number | `60` | Rate limit time window (seconds) |
| `RATE_LIMIT_MAX` | number | `100` | Max requests per time window |
| `BCRYPT_ROUNDS` | number | `10` | Bcrypt salt rounds |
| `API_KEY` | string | - | API key (optional) |

## Validation Rules

### Database
- `DB_PORT`: Must be a valid port number (1-65535)
- `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`: Required, non-empty strings

### Redis
- `REDIS_PORT`: Must be a valid port number (1-65535)
- `REDIS_DB`: Must be between 0-15

### JWT
- `JWT_SECRET`: Required, non-empty string
- `JWT_EXPIRATION`: String format (e.g., "24h", "7d", "30m")

### CORS
- `CORS_ORIGIN`: String or comma-separated list
- `CORS_CREDENTIALS`: Boolean

### Logging
- `LOG_LEVEL`: Must be one of: `error`, `warn`, `info`, `debug`, `verbose`

## Error Handling

Nếu validation fails, app sẽ không start và hiển thị lỗi:

```
Environment validation failed:
DB_HOST: should not be empty
DB_PORT: must be a port
JWT_SECRET: should not be empty
```

Sửa các lỗi trong file `.env` và restart app.

## Best Practices

### 1. Không commit .env file

```gitignore
.env
.env.local
.env.*.local
```

### 2. Sử dụng .env.example

- Commit `.env.example` với template
- Không commit giá trị thực tế

### 3. Production

- Sử dụng environment variables từ hosting platform
- Không hardcode secrets trong code
- Rotate secrets định kỳ

### 4. Type Safety

Luôn sử dụng ConfigService thay vì `process.env` trực tiếp:

```typescript
// ❌ Bad
const port = process.env.PORT;

// ✅ Good
const port = this.configService.get<number>('app.app.port');
```

## Testing

Trong test files, có thể override config:

```typescript
const module = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideProvider(ConfigService)
  .useValue({
    get: (key: string) => {
      const testConfig = {
        'app.app.port': 3001,
        'app.database.host': 'localhost',
        // ...
      };
      return testConfig[key];
    },
  })
  .compile();
```

## Troubleshooting

### App không start với validation error

1. Kiểm tra file `.env` có tồn tại không
2. Kiểm tra tất cả required variables đã được set
3. Kiểm tra format của các values (port phải là number, etc.)
4. Xem error message để biết variable nào sai

### Config không được load

1. Kiểm tra `ConfigModule.forRoot()` đã được import trong AppModule
2. Kiểm tra `envFilePath: '.env'` đúng không
3. Kiểm tra file `.env` ở root directory

### Type không đúng

1. Đảm bảo sử dụng type assertion: `get<Type>('key')`
2. Kiểm tra AppConfig interface có đúng không
3. Sử dụng IntelliSense để verify types
