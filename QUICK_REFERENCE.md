# 🚀 Quick Reference Guide

## Repository Pattern + Stored Procedures

### File Structure Quick Map

```
Authentication:
  Controller → src/modules/auth/auth.controller.ts
  Service   → src/modules/auth/auth.service.ts
  Repo      → src/modules/auth/repositories/auth.repository.ts
  Module    → src/modules/auth/auth.module.ts
  DTOs      → src/modules/auth/dto/

Users Management:
  Controller → src/modules/users/users.controller.ts
  Service   → src/modules/users/users.service.ts
  Repo      → src/modules/users/repositories/users.repository.ts
  Module    → src/modules/users/users.module.ts
  DTOs      → src/modules/users/dto/

Stored Procedures:
  Migration → src/migrations/1673616000000-CreateUsersProcedures.ts
  DB File   → (Generated in MySQL)
```

---

## Layer Responsibilities

| Layer | Responsibility | Example |
|-------|-----------------|---------|
| **Controller** | Handle HTTP, call service | `@Post('register')` → `authService.register()` |
| **Service** | Business logic, validation | Hash password, check email exists |
| **Repository** | Call stored procedures | `CALL sp_user_find_by_email(?)` |
| **Database** | Execute procedure, return data | INSERT/SELECT/UPDATE in procedure |

---

## Adding a New Stored Procedure

### Step 1: Create Migration
```bash
npm run migration:create src/migrations/AddProcedure
```

### Step 2: Write Procedure
```typescript
// src/migrations/AddProcedure.ts
async up(queryRunner) {
  await queryRunner.query(`
    CREATE PROCEDURE sp_my_procedure(
      IN p_param VARCHAR(255)
    )
    READS SQL DATA
    BEGIN
      SELECT * FROM my_table WHERE column = p_param;
    END
  `);
}
```

### Step 3: Run Migration
```bash
npm run migration:run
```

### Step 4: Add Repository Method
```typescript
// src/modules/mymodule/repositories/mymodule.repository.ts
async myMethod(param: string) {
  const result = await this.dataSource.query(
    'CALL sp_my_procedure(?)',
    [param]
  );
  return result[0]?.[0];
}
```

### Step 5: Add Service Method
```typescript
// src/modules/mymodule/mymodule.service.ts
async myMethod(param: string) {
  // Business logic here
  return this.repository.myMethod(param);
}
```

### Step 6: Add Controller Endpoint
```typescript
// src/modules/mymodule/mymodule.controller.ts
@Get()
async myMethod(@Query('param') param: string) {
  return this.service.myMethod(param);
}
```

---

## Common Commands

### Development
```bash
npm run dev                    # Start dev server (watch mode)
npm run build                  # Build for production
npm start:prod               # Run production build

npm run migration:generate    # Auto-generate from entities
npm run migration:run         # Run pending migrations
npm run migration:show        # Show migration status
npm run migration:revert      # Revert last migration
```

### Testing API
```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Protected endpoint (replace TOKEN)
curl -X GET http://localhost:3000/users/me \
  -H "Authorization: Bearer TOKEN"
```

---

## API Endpoints Summary

### Auth Routes
| Method | Route | Public? | Purpose |
|--------|-------|---------|---------|
| POST | `/auth/register` | Yes | Register new user |
| POST | `/auth/login` | Yes | Login user |
| GET | `/auth/me` | No | Get current user profile |

### Users Routes
| Method | Route | Public? | Purpose |
|--------|-------|---------|---------|
| GET | `/users` | No | Get all users (paginated) |
| GET | `/users/statistics` | No | Get user statistics |
| GET | `/users/me` | No | Get current user |
| GET | `/users/:id` | No | Get user by ID |
| PATCH | `/users/me` | No | Update current user |
| PATCH | `/users/:id` | No | Update user by ID |
| DELETE | `/users/:id` | No | Delete user |

---

## Error Handling

### Exception Types
```typescript
// Built-in exceptions
throw new NotFoundException('User', userId);
throw new ConflictException('Email already exists');
throw new UnauthorizedException('Invalid credentials');
throw new BusinessException('Account banned');
throw new ValidationException('Invalid input');
```

### Response Format
```json
// Success
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-01-13T00:00:00Z"
}

// Error
{
  "statusCode": 400,
  "code": "ERROR_CODE",
  "message": "Error description",
  "timestamp": "2026-01-13T00:00:00Z",
  "path": "/api/endpoint"
}
```

---

## Dependency Injection Pattern

```typescript
// 1. Declare in providers (module)
@Module({
  providers: [MyService, MyRepository],
})

// 2. Inject in service
constructor(private readonly myRepository: MyRepository) {}

// 3. Use in methods
async method() {
  return this.myRepository.getData();
}
```

---

## Module Structure Template

```typescript
// 1. Create module folder
src/modules/mymodule/

// 2. Create necessary folders
├── dto/              # Data Transfer Objects
├── repositories/     # Data Access Layer
├── mymodule.controller.ts
├── mymodule.service.ts
├── mymodule.module.ts
└── index.ts         # Exports

// 3. Export from module
// src/modules/mymodule/index.ts
export * from './mymodule.module';

// 4. Import in AppModule
// src/app.module.ts
imports: [MyModule]
```

---

## Stored Procedure Best Practices

### Do ✅
```sql
-- Use parameters
CALL sp_user_find_by_id(?) ← Safe!

-- Use transactions for multi-step operations
START TRANSACTION;
  -- Multiple operations
COMMIT;

-- Return results clearly
SELECT id, name, email FROM table WHERE ...;

-- Add error handling
BEGIN ... DECLARE EXIT HANDLER FOR ... END;
```

### Don't ❌
```sql
-- Don't use string concatenation
CALL sp_user_find_by_id('' + userId + '') ← SQL Injection!

-- Don't return multiple result sets (confusing in Node)

-- Don't use complex business logic (belongs in service)

-- Don't forget to document procedures
```

---

## Testing Strategy

### Unit Tests (Service)
```typescript
// Mock repository
const mockRepository = {
  findByEmail: jest.fn()
};

// Test service
const service = new AuthService(mockRepository);
await service.login({ email, password });
expect(mockRepository.findByEmail).toHaveBeenCalledWith(email);
```

### Integration Tests (API)
```bash
# Test with real server
curl -X POST http://localhost:3000/auth/register \
  -d '{"email":"test@example.com","password":"password123"}'
```

---

## Deployment Checklist

- [ ] Run migrations: `npm run migration:run`
- [ ] Build: `npm run build`
- [ ] Test API endpoints
- [ ] Check environment variables
- [ ] Verify database connection
- [ ] Check error logs
- [ ] Monitor performance

---

## Useful Links

- [Architecture Documentation](./ARCHITECTURE.md)
- [API Documentation](./API_DOCUMENTATION.md)
- [Testing Guide](./TESTING.md)
- [Refactoring Summary](./REFACTORING_COMPLETE.md)

---

## Project Status

✅ **Foundation Complete:**
- Auth module with JWT
- Users module with CRUD
- Repository pattern
- 9 stored procedures
- Error handling
- Global interceptors

🚀 **Ready for Next Phase:**
- Wallets module
- Markets module
- Orders module
- Trades module
- Caching (Redis)
- WebSocket integration

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Modules | 2 (Auth, Users) |
| Controllers | 2 |
| Services | 2 |
| Repositories | 2 |
| Stored Procedures | 9 |
| API Endpoints | 10 |
| Lines of Code | ~1500 |
| Test Coverage | Ready for 80%+ |
| Documentation | 4 Guides |

---

**Last Updated:** Jan 13, 2026
**Version:** 1.0.0
**Status:** Production Ready ✅
