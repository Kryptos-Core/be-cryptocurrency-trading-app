# Swagger Documentation - Hướng Dẫn Sử Dụng

## Tổng Quan

Swagger đã được tích hợp vào project để tự động generate API documentation. Swagger UI có sẵn tại `/api/docs` khi chạy ở môi trường development.

## Truy Cập Swagger UI

Khi ứng dụng chạy ở development mode:

```
http://localhost:3000/api/docs
```

Swagger sẽ tự động ẩn trong production mode để bảo mật.

## Cấu Hình

### Environment Variables

Swagger tự động được enable trong development mode. Không cần cấu hình thêm.

### Authentication

Swagger đã được cấu hình với JWT Bearer Authentication:
1. Click vào nút "Authorize" ở góc trên bên phải
2. Nhập JWT token (không cần prefix "Bearer")
3. Token sẽ được persist sau khi refresh page

## Sử Dụng Decorators

### Controller Decorators

```typescript
import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiSuccessResponse, ApiUnauthorizedResponse } from '@/common/decorators';

@ApiTags('users') // Group endpoints by tag
@ApiBearerAuth('JWT-auth') // Require authentication
@Controller('users')
export class UsersController {
  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description: 'Retrieve a paginated list of all users',
  })
  @ApiSuccessResponse('Users retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findAll() {
    // ...
  }
}
```

### DTO Decorators

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    description: 'User first name',
    example: 'John',
  })
  @IsString()
  @IsOptional()
  firstName?: string;
}
```

### Response Decorators

Sử dụng custom response decorators từ `@/common/decorators`:

```typescript
import {
  ApiSuccessResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
} from '@/common/decorators';

@Post()
@ApiCreatedResponse('User created successfully', {
  schema: {
    example: {
      success: true,
      data: { id: 1, email: 'user@example.com' },
    },
  },
})
@ApiBadRequestResponse('Invalid input data')
async create() {
  // ...
}
```

## API Versioning

### Sử dụng API Version Decorator

```typescript
import { ApiV1 } from '@/common/decorators';

@ApiV1() // Tạo route: /api/v1/users
@ApiTags('users')
@Controller('users')
export class UsersController {
  // ...
}
```

Hoặc custom version:

```typescript
import { ApiVersion } from '@/common/decorators';

@ApiVersion('v2') // Tạo route: /api/v2/users
@ApiTags('users')
@Controller('users')
export class UsersV2Controller {
  // ...
}
```

## Best Practices

### 1. Luôn thêm ApiOperation

```typescript
@ApiOperation({
  summary: 'Short description',
  description: 'Detailed description of what this endpoint does',
})
```

### 2. Document tất cả DTOs

```typescript
@ApiProperty({
  description: 'Clear description',
  example: 'Example value',
  required: true,
})
```

### 3. Document responses

```typescript
@ApiSuccessResponse('Success message', {
  schema: {
    example: {
      success: true,
      data: { /* example data */ },
    },
  },
})
```

### 4. Group endpoints với tags

```typescript
@ApiTags('users') // Tất cả endpoints trong controller này sẽ được group
```

### 5. Mark authentication requirements

```typescript
@ApiBearerAuth('JWT-auth') // Cho protected endpoints
```

## Custom Response Decorators

Các decorators có sẵn:

- `@ApiSuccessResponse()` - 200 OK
- `@ApiCreatedResponse()` - 201 Created
- `@ApiBadRequestResponse()` - 400 Bad Request
- `@ApiUnauthorizedResponse()` - 401 Unauthorized
- `@ApiForbiddenResponse()` - 403 Forbidden
- `@ApiNotFoundResponse()` - 404 Not Found
- `@ApiConflictResponse()` - 409 Conflict
- `@ApiInternalServerErrorResponse()` - 500 Internal Server Error

## Testing với Swagger UI

1. **Test Public Endpoints:**
   - Không cần authentication
   - Click "Try it out" và fill data
   - Click "Execute"

2. **Test Protected Endpoints:**
   - Đăng nhập trước để lấy token
   - Click "Authorize" và nhập token
   - Test các protected endpoints

3. **View Response:**
   - Response sẽ hiển thị status code, headers, và body
   - Có thể copy curl command để test từ terminal

## Export Swagger JSON

Swagger JSON có thể được export tại:

```
http://localhost:3000/api/docs-json
```

Có thể dùng để:
- Import vào Postman
- Generate client SDKs
- Share với frontend