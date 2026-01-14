# Base Repository Pattern - Hướng Dẫn Sử Dụng

## Tổng Quan

Base Repository Pattern đã được implement với:
- **Repository Pattern**: Data access abstraction
- **Template Method Pattern**: Base operations template
- **Generic Programming**: Type-safe repositories
- **Interface Segregation**: IRepository interface

## Cấu Trúc

### Files

1. **`src/common/repositories/interfaces/irepository.interface.ts`**
   - IRepository interface định nghĩa contract
   - Type-safe với generics

2. **`src/common/repositories/base.repository.ts`**
   - BaseRepository abstract class
   - Implement IRepository interface
   - CRUD operations cơ bản
   - Template methods có thể override

3. **`src/common/repositories/index.ts`**
   - Export tất cả repositories

## Sử Dụng Base Repository

### 1. Tạo Repository Kế Thừa BaseRepository

```typescript
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { User } from '@/entities/user.entity';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(dataSource: DataSource) {
    super(User, dataSource);
  }

  // Override hoặc thêm custom methods
  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({
      where: { email: email.toLowerCase() } as any,
    });
  }

  // Custom query với stored procedure
  async findWithStatistics(): Promise<{ users: User[]; total: number }> {
    const result = await this.query('CALL sp_user_find_all_with_stats()');
    return {
      users: result[0] || [],
      total: result[1]?.[0]?.total || 0,
    };
  }
}
```

### 2. Register Repository trong Module

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRepository } from './repositories/user.repository';
import { User } from '@/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserRepository],
  exports: [UserRepository],
})
export class UsersModule {}
```

### 3. Inject Repository trong Service

```typescript
import { Injectable } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  async findById(id: number) {
    // Sử dụng method từ BaseRepository
    return this.userRepository.findById(id);
  }

  async findAll(page: number, limit: number) {
    // Sử dụng pagination từ BaseRepository
    return this.userRepository.findWithPagination(page, limit);
  }

  async create(userData: Partial<User>) {
    // Sử dụng create từ BaseRepository
    return this.userRepository.create(userData);
  }

  async update(id: number, updates: Partial<User>) {
    // Sử dụng update từ BaseRepository
    return this.userRepository.update(id, updates);
  }

  async delete(id: number) {
    // Sử dụng delete từ BaseRepository
    return this.userRepository.delete(id);
  }
}
```

## CRUD Operations

### Create

```typescript
// Create single entity
const user = await repository.create({
  email: 'user@example.com',
  firstName: 'John',
  lastName: 'Doe',
});

// Create multiple entities
const users = await repository.createMany([
  { email: 'user1@example.com' },
  { email: 'user2@example.com' },
]);
```

### Read

```typescript
// Find by ID
const user = await repository.findById(1);

// Find one with options
const user = await repository.findOne({
  where: { email: 'user@example.com' },
  relations: ['wallets'],
});

// Find all
const users = await repository.find();

// Find with conditions
const activeUsers = await repository.find({
  where: { status: 'ACTIVE' },
  order: { createdAt: 'DESC' },
});

// Find with pagination
const result = await repository.findWithPagination(1, 10, {
  where: { status: 'ACTIVE' },
});
// Returns: { data: User[], total: number, page: 1, limit: 10 }
```

### Update

```typescript
// Update by ID
const updated = await repository.update(1, {
  firstName: 'Jane',
  status: 'ACTIVE',
});

// Update multiple
const affected = await repository.updateMany(
  { status: 'PENDING' },
  { status: 'ACTIVE' },
);
```

### Delete

```typescript
// Delete by ID
await repository.delete(1);

// Delete multiple
const deleted = await repository.deleteMany({ status: 'BANNED' });

// Hard delete
await repository.hardDelete(1);
```

## Advanced Operations

### Count

```typescript
// Count all
const total = await repository.count();

// Count with conditions
const activeCount = await repository.count({
  where: { status: 'ACTIVE' },
});
```

### Exists

```typescript
// Check if entity exists
const exists = await repository.exists({ email: 'user@example.com' });
```

### Save (Create or Update)

```typescript
// Save entity (create if new, update if exists)
const user = await repository.save({
  id: 1, // If ID exists, will update
  email: 'user@example.com',
});

// Save multiple
const users = await repository.saveMany([
  { id: 1, email: 'user1@example.com' },
  { email: 'user2@example.com' }, // New entity
]);
```

### Transactions

```typescript
// Execute transaction
await repository.transaction(async (manager) => {
  const user = await manager.save(User, { email: 'user@example.com' });
  await manager.save(Wallet, { userId: user.id, currencyId: 1 });
  return user;
});
```

### Raw Queries

```typescript
// Execute raw query
const result = await repository.query(
  'CALL sp_user_find_by_email(?)',
  ['user@example.com'],
);

// Stored procedures
const stats = await repository.query('CALL sp_user_get_statistics()');
```

### Access TypeORM Repository

```typescript
// Get TypeORM Repository for complex queries
const typeormRepo = repository.getRepository();

// Use TypeORM QueryBuilder
const users = await typeormRepo
  .createQueryBuilder('user')
  .leftJoinAndSelect('user.wallets', 'wallet')
  .where('user.status = :status', { status: 'ACTIVE' })
  .getMany();
```

## Template Method Pattern

### Override Base Methods

```typescript
@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(dataSource: DataSource) {
    super(User, dataSource);
  }

  // Override delete để implement soft delete
  async delete(id: number | string): Promise<void> {
    // Soft delete implementation
    await this.update(id, { deletedAt: new Date() } as any);
  }

  // Override create để add custom logic
  async create(entity: DeepPartial<User>): Promise<User> {
    // Pre-create logic
    if (entity.email) {
      entity.email = entity.email.toLowerCase();
    }

    // Call parent method
    return super.create(entity);
  }
}
```

## Best Practices

### 1. Extend BaseRepository cho mỗi Entity

```typescript
@Injectable()
export class CurrencyRepository extends BaseRepository<Currency> {
  constructor(dataSource: DataSource) {
    super(Currency, dataSource);
  }
}
```

### 2. Thêm Custom Methods khi cần

```typescript
@Injectable()
export class OrderRepository extends BaseRepository<Order> {
  constructor(dataSource: DataSource) {
    super(Order, dataSource);
  }

  // Custom method cho business logic
  async findOpenOrdersByUser(userId: number): Promise<Order[]> {
    return this.find({
      where: {
        userId,
        status: 'OPEN',
      } as any,
      order: { createdAt: 'ASC' },
    });
  }

  // Complex query với QueryBuilder
  async findOrdersWithTrades(pairId: number): Promise<Order[]> {
    return this.getRepository()
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.trades', 'trade')
      .where('order.pairId = :pairId', { pairId })
      .getMany();
  }
}
```

### 3. Sử dụng Transactions cho Complex Operations

```typescript
async createOrderWithWalletUpdate(orderData: CreateOrderDto, userId: number) {
  return this.transaction(async (manager) => {
    // Create order
    const order = await manager.save(Order, orderData);

    // Update wallet
    await manager.update(Wallet, { userId }, { frozen: newBalance });

    return order;
  });
}
```

### 4. Error Handling

BaseRepository đã có error handling, nhưng có thể override:

```typescript
async findById(id: number | string): Promise<User | null> {
  try {
    return await super.findById(id);
  } catch (error) {
    // Custom error handling
    this.logger.error(`Custom error for user ${id}`, error);
    throw new NotFoundException(`User with ID ${id} not found`);
  }
}
```

## Migration từ Existing Repositories

Nếu bạn đã có repositories sử dụng DataSource, có thể migrate:

### Before (DataSource)

```typescript
@Injectable()
export class UsersRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findById(id: number) {
    const result = await this.dataSource.query('CALL sp_user_find_by_id(?)', [id]);
    return result[0]?.[0] || null;
  }
}
```

### After (BaseRepository)

```typescript
@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor(dataSource: DataSource) {
    super(User, dataSource);
  }

  // Sử dụng BaseRepository method
  async findById(id: number) {
    return super.findById(id);
  }

  // Hoặc giữ stored procedure nếu cần
  async findByIdWithProcedure(id: number) {
    const result = await this.query('CALL sp_user_find_by_id(?)', [id]);
    return result[0]?.[0] || null;
  }
}
```

## Type Safety

BaseRepository sử dụng generics để đảm bảo type safety:

```typescript
// ✅ Type-safe
const user: User = await userRepository.findById(1);
const users: User[] = await userRepository.find();

// ✅ TypeScript sẽ báo lỗi nếu sai type
const user = await userRepository.findById('1'); // OK, accepts string | number
const user = await userRepository.update(1, { invalidField: 'value' }); // ❌ Type error
```

## SOLID Principles

### Single Responsibility
- BaseRepository chỉ handle data access
- Business logic ở Service layer

### Open/Closed
- BaseRepository mở để mở rộng (override methods)
- Đóng để sửa đổi (không sửa base class)

### Liskov Substitution
- Mọi repository extends BaseRepository có thể thay thế IRepository
- Có thể inject IRepository thay vì concrete class

### Interface Segregation
- IRepository interface nhỏ, specific
- Chỉ định nghĩa operations cần thiết

### Dependency Inversion
- Depend on IRepository interface
- Không depend on concrete implementation

## Kết Luận

Base Repository Pattern cung cấp:
- ✅ CRUD operations chuẩn hóa
- ✅ Type safety với generics
- ✅ Template methods có thể override
- ✅ Transaction support
- ✅ Raw query support
- ✅ Pagination built-in
- ✅ Error handling tự động
- ✅ Logging tự động

Sử dụng BaseRepository cho tất cả repositories để đảm bảo consistency và maintainability.
