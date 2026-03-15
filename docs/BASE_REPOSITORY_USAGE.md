# Mẫu Base Repository - Cách sử dụng hiện tại

## Tổng quan

Dự án sử dụng một BaseRepository dùng chung tại `src/common/repositories/base.repository.ts`.
Nó cung cấp các hàm generic cho CRUD, phân trang, hỗ trợ transaction và truy vấn thô (raw query).

## Các phương thức chính có sẵn

- findById
- findOne
- find
- findWithPagination
- count
- exists
- create
- createMany
- update
- updateMany
- delete
- deleteMany
- hardDelete
- save
- saveMany
- transaction
- query

## Ví dụ cơ bản

```typescript
@Injectable()
export class CurrencyRepository extends BaseRepository<Currency> {
  constructor(dataSource: DataSource) {
    super(Currency, dataSource);
  }

  async findBySymbol(symbol: string) {
    return this.findOne({ where: { symbol } as any });
  }
}
```

## Lưu ý

- BaseRepository tự động xác định khóa chính (primary key) từ metadata của entity.
- Sử dụng `transaction(...)` khi cập nhật nhiều bảng trong cùng một luồng nghiệp vụ.
- `query(...)` được dùng cho các stored procedure và các câu lệnh SQL không thuận tiện khi sử dụng QueryBuilder.
