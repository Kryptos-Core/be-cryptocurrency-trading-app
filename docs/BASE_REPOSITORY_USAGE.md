# Base Repository Pattern - Current Usage

## Overview

Project uses a shared BaseRepository in src/common/repositories/base.repository.ts.
It provides generic CRUD, pagination, transaction helpers, and raw query support.

## Main methods available

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

## Minimal example

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

## Notes

- BaseRepository auto-resolves primary key from entity metadata.
- Use transaction(...) when updating multiple tables in one business flow.
- query(...) is available for stored procedures and SQL that is not convenient in QueryBuilder.
