# 🏗️ Backend Architecture - Option B: Repository Pattern + Stored Procedures

## Overview

This backend uses a **clean architecture** with the **Repository Pattern** combined with **Database Stored Procedures** for maximum security, performance, and maintainability.

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTROLLER LAYER                         │
│          (HTTP Requests/Responses, Route Handlers)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    SERVICE LAYER                            │
│         (Business Logic, Validation, Authorization)         │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   REPOSITORY LAYER                          │
│            (Data Access Abstraction, Queries)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│            DATABASE STORED PROCEDURES                       │
│      (SQL Logic, Optimization, Security at DB Level)        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  MYSQL DATABASE                             │
│          (Persistent Data Storage & Procedures)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Architecture Layers

### 1. **Controller Layer** (API Endpoints)

```typescript
// Example: AuthController
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto); // ← Calls Service
  }
}
```

**Responsibility:**
- Handle HTTP requests/responses
- Call services for business logic
- Never access database directly
- Delegate validation to DTOs and services

---

### 2. **Service Layer** (Business Logic)

```typescript
// Example: AuthService
@Injectable()
export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  async register(registerDto: RegisterDto) {
    // Business Logic:
    // 1. Validate input
    // 2. Check if email exists
    // 3. Hash password
    // 4. Call repository to create user
    // 5. Generate JWT token
    
    const passwordHash = await this.hashPassword(registerDto.password);
    const user = await this.authRepository.createUser(
      registerDto.email,
      passwordHash
    );
    const token = this.generateAccessToken(user);
    return { accessToken: token, user };
  }
}
```

**Responsibility:**
- Implement business rules
- Coordinate multiple repositories
- Handle authorization/permissions
- Transform data between DTOs and entities
- **NEVER access database directly** - Always use repositories
- **NEVER write SQL** - Always call stored procedures

---

### 3. **Repository Layer** (Data Access Abstraction)

```typescript
// Example: AuthRepository
@Injectable()
export class AuthRepository {
  constructor(private readonly dataSource: DataSource) {}

  // Call stored procedure
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.dataSource.query(
      'CALL sp_user_find_by_email(?)',
      [email]
    );
    return result[0]?.[0] || null;
  }

  // Another stored procedure call
  async createUser(email: string, passwordHash: string): Promise<User> {
    const result = await this.dataSource.query(
      'CALL sp_user_create(?, ?)',
      [email, passwordHash]
    );
    const userId = result[0]?.[0]?.user_id;
    return this.findById(userId);
  }
}
```

**Responsibility:**
- Call stored procedures
- Transform raw database results
- Handle database errors
- **NEVER have business logic** - Just data access
- **NEVER write complex SQL** - Use stored procedures

---

### 4. **Database Layer** (Stored Procedures)

```sql
-- Example: Create user stored procedure
CREATE PROCEDURE sp_user_create(
  IN p_email VARCHAR(255),
  IN p_password_hash VARCHAR(255)
)
MODIFIES SQL DATA
BEGIN
  INSERT INTO users (email, password_hash, status, created_at)
  VALUES (p_email, p_password_hash, 'ACTIVE', NOW());
  
  SELECT LAST_INSERT_ID() as user_id;
END
```

**Responsibility:**
- Implement database-level logic
- Ensure data consistency via transactions
- Optimize queries at database level
- Prevent SQL injection
- Maintain data integrity

---

## 🔄 Request Flow Example

### User Registration Flow

```
1. HTTP Request
   POST /auth/register
   { "email": "user@example.com", "password": "password123" }
        ↓
2. Controller (AuthController.register)
   - Validates DTO automatically
   - Calls AuthService.register()
        ↓
3. Service (AuthService.register)
   - Check email doesn't exist
   - Hash password with bcrypt
   - Calls AuthRepository.createUser()
   - Generate JWT token
   - Return response
        ↓
4. Repository (AuthRepository.createUser)
   - Call CALL sp_user_create(?, ?)
   - Fetch created user via sp_user_find_by_id
   - Return User object
        ↓
5. Database (Stored Procedure)
   - INSERT new user into users table
   - Return LAST_INSERT_ID()
   - SELECT user from table
        ↓
6. HTTP Response
   {
     "success": true,
     "data": {
       "accessToken": "eyJhbGci...",
       "user": { "user_id": 1, "email": "user@example.com" }
     }
   }
```

---

## ✅ Benefits of This Architecture

### 1. **Security (SQL Injection Prevention)**
```typescript
// ❌ NEVER do this:
const result = await dataSource.query(
  `SELECT * FROM users WHERE email = '${email}'` // ← SQL Injection!
);

// ✅ Do this instead (Stored Procedures):
const result = await dataSource.query(
  'CALL sp_user_find_by_email(?)',
  [email] // ← Parameterized, safe!
);
```

### 2. **Performance (Database Optimization)**
- Stored procedures are compiled on database
- Executed faster than raw queries
- Network traffic reduced (complex logic stays in DB)
- Example: Statistical aggregations done at DB level

```sql
-- Complex query optimized at DB:
CREATE PROCEDURE sp_user_get_statistics()
BEGIN
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
    SUM(CASE WHEN status = 'BANNED' THEN 1 ELSE 0 END) as banned
  FROM users;
END
```

### 3. **Maintainability (Separation of Concerns)**
- **Service** = What to do (business logic)
- **Repository** = How to get data (data access)
- **Stored Procedure** = How to access database efficiently

Changes to database queries don't affect service logic.

### 4. **Testability (Easy Mocking)**
```typescript
// Easy to mock in tests:
const mockRepository = {
  findByEmail: jest.fn().mockResolvedValue(testUser),
};

const service = new AuthService(mockRepository);
const result = await service.register(registerDto);
// ← Test without real database!
```

### 5. **Scalability (Database Profiling)**
- Can optimize procedures without touching code
- Can add indexes/caching at DB level
- Easy to migrate to different DB (update procedures)

### 6. **Transactions & Data Integrity**
```sql
-- Stored procedures can manage transactions:
CREATE PROCEDURE sp_transfer_funds(
  IN p_from_user_id BIGINT,
  IN p_to_user_id BIGINT,
  IN p_amount DECIMAL(18,8)
)
BEGIN
  START TRANSACTION;
  
  UPDATE wallets SET balance = balance - p_amount 
  WHERE user_id = p_from_user_id;
  
  UPDATE wallets SET balance = balance + p_amount 
  WHERE user_id = p_to_user_id;
  
  COMMIT;
END
```

---

## 📁 Directory Structure

```
src/
├── common/                          # Shared utilities
│   ├── decorators/
│   ├── exceptions/
│   ├── filters/
│   ├── guards/
│   └── interceptors/
│
├── modules/
│   ├── auth/
│   │   ├── dto/                    # Data Transfer Objects
│   │   │   ├── register.dto.ts
│   │   │   ├── login.dto.ts
│   │   │   └── ...
│   │   ├── repositories/           # Data Access (Repository Pattern)
│   │   │   ├── auth.repository.ts  # Calls stored procedures
│   │   │   └── index.ts
│   │   ├── strategies/             # JWT Strategy
│   │   │   └── jwt.strategy.ts
│   │   ├── auth.service.ts         # Business Logic
│   │   ├── auth.controller.ts      # API Routes
│   │   └── auth.module.ts
│   │
│   ├── users/
│   │   ├── dto/
│   │   ├── repositories/           # Data Access
│   │   │   ├── users.repository.ts
│   │   │   └── index.ts
│   │   ├── users.service.ts        # Business Logic
│   │   ├── users.controller.ts     # API Routes
│   │   └── users.module.ts
│   │
│   └── (other modules follow same pattern)
│
├── migrations/                      # TypeORM Migrations
│   ├── CreateUsersProcedures.ts     # Create stored procedures
│   └── ...
│
├── entities/                        # Database Entities (Schema)
├── config/                          # Configuration
└── app.module.ts                    # Root Module
```

---

## 🔌 Dependency Injection Pattern

```typescript
// Module provides repositories to services
@Module({
  providers: [
    AuthService,      // Service depends on repository
    AuthRepository,    // Repository depends on DataSource
  ],
  exports: [AuthService, AuthRepository],
})
export class AuthModule {}

// Service constructor receives repository via DI
@Injectable()
export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}
  // ↑ NestJS automatically injects AuthRepository
}

// Repository receives DataSource via DI
@Injectable()
export class AuthRepository {
  constructor(private readonly dataSource: DataSource) {}
  // ↑ NestJS automatically injects DataSource
}
```

**Why this matters:**
- Easy to swap implementations (testing)
- No global state
- Clear dependencies
- Follow SOLID principles

---

## 🗄️ Stored Procedures List

### Users Module

| Procedure | Purpose | Parameters |
|-----------|---------|------------|
| `sp_user_find_by_id` | Get user by ID | `user_id` |
| `sp_user_find_by_email` | Get user by email | `email` |
| `sp_user_find_all` | Get paginated users | `skip, take` |
| `sp_user_create` | Create new user | `email, password_hash` |
| `sp_user_update` | Update user | `user_id, email, status` |
| `sp_user_delete` | Soft delete user | `user_id` |
| `sp_user_get_statistics` | Get user stats | None |
| `sp_user_count` | Count total users | None |
| `sp_user_email_exists` | Check email exists | `email, exclude_user_id` |

---

## 🚀 Adding New Stored Procedures

### Step 1: Create Migration

```typescript
// src/migrations/AddNewProcedure.ts
export class AddNewProcedure1673616000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE PROCEDURE sp_new_operation(
        IN p_param1 VARCHAR(255)
      )
      READS SQL DATA
      BEGIN
        SELECT * FROM table WHERE column = p_param1;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_new_operation');
  }
}
```

### Step 2: Run Migration

```bash
npm run migration:run
```

### Step 3: Add Repository Method

```typescript
// In repository class
async newOperation(param: string): Promise<Result[]> {
  const result = await this.dataSource.query(
    'CALL sp_new_operation(?)',
    [param]
  );
  return result[0] || [];
}
```

### Step 4: Add Service Method

```typescript
// In service class
async newOperation(param: string): Promise<Result[]> {
  // Business logic if needed
  return this.repository.newOperation(param);
}
```

---

## 📊 Data Flow Summary

```
Request → Controller → Service → Repository → Stored Procedure → Database
   ↓                     ↓          ↓              ↓                ↓
 Parse               Validate    Format        Execute          Return
  Input              & Logic    Parameters      Query            Data
   ↓                     ↓          ↓              ↓                ↓
Response ← Controller ← Service ← Repository ← Stored Procedure ← Database
   ↓                     ↓          ↓              ↓                ↓
 Format              Transform   Parse          Process          Raw
Response             & Return   Results         Data             Results
```

---

## 🎓 SOLID Principles Applied

| Principle | How Applied |
|-----------|------------|
| **S**RP | Each layer has single responsibility |
| **O**CP | Easy to extend with new procedures without modifying existing code |
| **L**SP | Procedures follow consistent interface pattern |
| **I**SP | Repositories only expose methods they implement |
| **D**IP | Services depend on repository abstraction, not concrete implementation |

---

## 📚 References

- [Repository Pattern](https://refactoring.guru/design-patterns/repository)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [MySQL Stored Procedures](https://dev.mysql.com/doc/refman/8.0/en/stored-procedures.html)
- [NestJS Documentation](https://docs.nestjs.com/)
