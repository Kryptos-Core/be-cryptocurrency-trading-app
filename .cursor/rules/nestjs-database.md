---
paths:
  - "**/*.ts"
  - "**/*.sql"
  - "**/migrations/**"
  - "**/entities/**"
---
# NestJS Database

> TypeORM conventions, migration safety, và query optimization.

## Entity Conventions

```typescript
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  @Index()
  userId: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  quantity: string; // Dùng string cho decimal để tránh floating point

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @VersionColumn()
  version: number; // Optimistic locking
}
```

**Quy tắc Entity:**
- Luôn dùng `uuid` cho primary key (không dùng auto-increment integer)
- Giá trị tiền tệ lưu dưới dạng `decimal` với precision cao, đọc ra `string` (không phải `number`)
- Luôn có `createdAt`, `updatedAt` (dùng `@CreateDateColumn`, `@UpdateDateColumn`)
- Thêm `@Index()` trên columns dùng trong WHERE clause
- Sử dụng `@VersionColumn()` cho optimistic locking trên entities nhạy cảm (orders, wallets)

## Migration Safety

### Quy tắc KHÔNG được vi phạm

```typescript
// BAD: Xóa column đang sử dụng
queryRunner.query(`ALTER TABLE orders DROP COLUMN old_status`);

// GOOD: Deprecate trước, xóa sau khi đã deploy và verify
// Migration 1: thêm column mới
// Migration 2 (sau khi code đã dùng column mới + verified): xóa column cũ
```

```typescript
// BAD: Rename column trực tiếp
queryRunner.query(`ALTER TABLE orders RENAME COLUMN qty TO quantity`);

// GOOD: Add new → copy data → deploy → drop old
```

```typescript
// BAD: Thêm NOT NULL column vào bảng đã có dữ liệu
queryRunner.query(`ALTER TABLE orders ADD COLUMN risk_score INT NOT NULL`);

// GOOD: Add NULLABLE first, backfill, then add constraint
queryRunner.query(`ALTER TABLE orders ADD COLUMN risk_score INT NULL`);
queryRunner.query(`UPDATE orders SET risk_score = 0 WHERE risk_score IS NULL`);
// (sau khi backfill xong) queryRunner.query(`ALTER TABLE orders ALTER COLUMN risk_score SET NOT NULL`);
```

### Migration File Naming

```
YYYY-MM-DD-HHmmSS-description.ts
Ví dụ: 1713200000000-AddRiskScoreToOrders.ts
```

### Không được xóa migration đã chạy

Migration files đã chạy trên production **không được xóa hoặc sửa**. Nếu cần rollback, tạo migration mới với `down()`.

## Query Optimization

### N+1 Prevention

```typescript
// BAD: N+1 query
const orders = await this.orderRepo.find({ where: { userId } });
for (const order of orders) {
  order.trades = await this.tradeRepo.find({ where: { orderId: order.id } }); // N queries!
}

// GOOD: Eager loading với relations
const orders = await this.orderRepo.find({
  where: { userId },
  relations: ['trades'],
  take: 20,
});

// GOOD: Query builder với JOIN
const orders = await this.orderRepo.createQueryBuilder('order')
  .leftJoinAndSelect('order.trades', 'trade')
  .where('order.userId = :userId', { userId })
  .take(20)
  .getMany();
```

### Pagination luôn cần LIMIT

```typescript
// BAD: Query không có limit
const orders = await this.orderRepo.find({ where: { userId } });

// GOOD: Luôn paginate
const [orders, total] = await this.orderRepo.findAndCount({
  where: { userId },
  order: { createdAt: 'DESC' },
  take: dto.limit,
  skip: (dto.page - 1) * dto.limit,
});
```

### Indexes cho Trading Queries

```typescript
// Composite index cho order book queries
@Entity('orders')
@Index(['marketId', 'side', 'status', 'price']) // Order book lookup
@Index(['userId', 'status', 'createdAt'])        // User order history
export class Order {}
```

## Transactions

```typescript
// Sử dụng DataSource transactions cho multi-step operations
async createOrderWithBalanceReservation(userId: string, dto: CreateOrderDto): Promise<Order> {
  return this.dataSource.transaction(async (manager) => {
    // Tất cả operations trong cùng transaction
    const wallet = await manager.findOne(Wallet, {
      where: { userId, currency: dto.currency },
      lock: { mode: 'pessimistic_write' }, // Row-level lock
    });

    if (wallet.available < dto.amount) {
      throw new InsufficientBalanceException(dto.amount, wallet.available);
    }

    wallet.available -= dto.amount;
    wallet.reserved += dto.amount;
    await manager.save(wallet);

    const order = manager.create(Order, { userId, ...dto });
    return manager.save(order);
  });
}
```

## Soft Delete

```typescript
// Đối với dữ liệu cần audit trail (orders, trades, wallets)
@Entity()
export class Order {
  @DeleteDateColumn()
  deletedAt?: Date; // Soft delete — row vẫn còn trong DB
}

// Query mặc định tự filter out soft-deleted rows
// Để query bao gồm deleted: { withDeleted: true }
```
