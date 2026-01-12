# 🚀 Cryptocurrency Trading Backend API

NestJS-based backend for cryptocurrency trading platform with clean architecture, SOLID principles, and design patterns.

## 📋 Table of Contents
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Design Patterns](#design-patterns)
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)

---

## 🛠️ Tech Stack

- **Framework**: NestJS 10.x
- **Database**: MySQL 8.0
- **ORM**: TypeORM 0.3.x
- **Authentication**: JWT (JSON Web Token)
- **Validation**: class-validator, class-transformer
- **Password Hashing**: bcrypt

---

## 🏗️ Architecture

### Layered Architecture
``` 
┌─────────────────────────────────────┐
│         Controller Layer            │  ← HTTP Requests/Responses
├─────────────────────────────────────┤
│         Service Layer               │  ← Business Logic
├─────────────────────────────────────┤
│         Repository Layer            │  ← Data Access (TypeORM)
├─────────────────────────────────────┤
│         Database (MySQL)            │  ← Persistent Storage
└─────────────────────────────────────┘
```

### SOLID Principles Applied

#### 1. **Single Responsibility Principle (SRP)**
- Each class has one reason to change
- `AuthService` → Authentication logic only
- `UsersService` → User management only
- `AllExceptionsFilter` → Error handling only

#### 2. **Open-Closed Principle (OCP)**
- Extensible via decorators (`@Public()`, `@CurrentUser()`)
- Custom exceptions extend base `AppException`
- Guards can be extended without modifying core

#### 3. **Liskov Substitution Principle (LSP)**
- All custom exceptions extend `AppException`
- Can be replaced with parent class without breaking code

#### 4. **Interface Segregation Principle (ISP)**
- DTOs are specific to use cases (RegisterDto, LoginDto, UpdateUserDto)
- Not forcing clients to depend on methods they don't use

#### 5. **Dependency Inversion Principle (DIP)**
- Services depend on abstractions (Repository interfaces)
- Injected via constructor (Dependency Injection)

---

## 🎨 Design Patterns

### 1. **Repository Pattern**
```typescript
// Services depend on Repository abstraction
constructor(
  @InjectRepository(User)
  private readonly userRepository: Repository<User>
) {}
```

### 2. **Strategy Pattern**
- JWT Strategy for authentication
- Can add OAuth, Google, Facebook strategies

### 3. **Decorator Pattern**
- `@Public()` - Mark routes as public
- `@CurrentUser()` - Extract user from request
- Interceptors wrap request/response

### 4. **Factory Pattern**
- `JwtModule.registerAsync()` - Factory for JWT config
- `TypeOrmModule.forRootAsync()` - Factory for DB config

### 5. **Singleton Pattern**
- NestJS services are singletons by default
- One instance per application lifecycle

### 6. **Guard Pattern**
- `JwtAuthGuard` - Protect routes
- Can add RolesGuard, PermissionsGuard

### 7. **Interceptor Pattern**
- `ResponseInterceptor` - Transform responses
- `LoggingInterceptor` - Log requests/responses

### 8. **Filter Pattern**
- `AllExceptionsFilter` - Catch all exceptions
- Unified error response format

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- MySQL 8.0

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd be-cryptocurrency-trading-app
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start MySQL with Docker**
```bash
docker compose -f docker-compose.infrastructure.yml up -d
```

5. **Run migrations**
```bash
npm run migration:generate src/migrations/InitialSchema
npm run migration:run
```

6. **Start development server**
```bash
npm run dev
```

Server runs at: `http://localhost:3000`

---

## 📡 API Endpoints

### Authentication

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "user_id": 1,
      "email": "user@example.com",
      "status": "ACTIVE",
      "created_at": "2026-01-13T00:00:00.000Z"
    }
  },
  "timestamp": "2026-01-13T00:00:00.000Z"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Get Profile (Protected)
```http
GET /auth/me
Authorization: Bearer <access_token>
```

---

### Users

#### Get All Users (Protected)
```http
GET /users?page=1&limit=10
Authorization: Bearer <access_token>
```

#### Get User by ID (Protected)
```http
GET /users/:id
Authorization: Bearer <access_token>
```

#### Update Current User (Protected)
```http
PATCH /users/me
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "newemail@example.com"
}
```

#### Get User Statistics (Protected)
```http
GET /users/statistics
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 100,
    "active": 85,
    "banned": 10,
    "pending": 5
  }
}
```

---

## 📁 Project Structure

```
src/
├── common/                    # Shared utilities
│   ├── decorators/           # Custom decorators (@Public, @CurrentUser)
│   ├── exceptions/           # Custom exceptions
│   ├── filters/              # Exception filters
│   ├── guards/               # Auth guards (JwtAuthGuard)
│   └── interceptors/         # Request/Response interceptors
│
├── config/                   # Configuration files
│   ├── data-source.ts       # TypeORM DataSource for migrations
│   └── typeorm.config.ts    # TypeORM runtime config
│
├── entities/                 # Database entities
│   ├── user.entity.ts
│   ├── wallet.entity.ts
│   ├── order.entity.ts
│   └── ...
│
├── modules/                  # Feature modules
│   ├── auth/                # Authentication module
│   │   ├── dto/
│   │   ├── strategies/      # Passport strategies
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   │
│   └── users/               # Users module
│       ├── dto/
│       ├── users.controller.ts
│       ├── users.service.ts
│       └── users.module.ts
│
├── migrations/              # Database migrations
├── app.module.ts           # Root module
└── main.ts                 # Application entry point
```

---

## 🔧 NPM Scripts

```bash
# Development
npm run dev                  # Start with watch mode
npm run start:debug         # Start with debug mode

# Build
npm run build               # Build for production
npm run start:prod          # Run production build

# Database Migrations
npm run migration:generate  # Generate migration from entities
npm run migration:run       # Run pending migrations
npm run migration:revert    # Revert last migration
npm run migration:show      # Show migration status

# Code Quality
npm run format              # Format code with Prettier
```

---

## 🔐 Error Handling

All errors follow consistent format:

```json
{
  "statusCode": 400,
  "code": "BUSINESS_ERROR",
  "message": "Detailed error message",
  "timestamp": "2026-01-13T00:00:00.000Z",
  "path": "/api/endpoint"
}
```

### Custom Exception Types
- `BusinessException` - Business logic errors
- `NotFoundException` - Resource not found
- `UnauthorizedException` - Authentication failed
- `ForbiddenException` - Authorization failed
- `ValidationException` - Input validation errors
- `ConflictException` - Resource conflict (e.g., duplicate email)

---

## 🎯 Next Steps

### Immediate Priorities (Week 3-4)
1. **Wallets Module**
   - Create/manage crypto wallets
   - Deposit/Withdrawal operations
   - Balance tracking

2. **Markets Module**
   - Currency management
   - Market pairs (BTC/USDT, ETH/USDT)
   - Real-time price updates

3. **Orders Module**
   - Create buy/sell orders
   - Order matching engine
   - Order history

4. **Trades Module**
   - Execute trades
   - Trade history
   - Transaction records

### Future Enhancements
- Redis caching for market data
- WebSocket for real-time updates
- Price alerts system
- Admin dashboard
- Role-based access control (RBAC)
- 2FA authentication
- API rate limiting
- Swagger documentation

---

## 📝 License

MIT License

---

## 👥 Contact

For questions or support, please contact the development team.
