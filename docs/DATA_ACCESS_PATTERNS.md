# Quyết định tầng Data Access (Repository + ORM + Stored Procedure)

Tài liệu này mô tả **khi nào** dùng `BaseRepository`, **repository tùy biến**, hoặc **Service inject `DataSource` trực tiếp** trong backend NestJS + TypeORM. Mục tiêu: tách **business orchestration** (Service) khỏi **persistence** (Repository), đồng thời giữ **KISS** — không ép một pattern cho mọi file.

**Xem thêm API cụ thể của `BaseRepository`:** [BASE_REPOSITORY_USAGE.md](./BASE_REPOSITORY_USAGE.md).

---

## Bảng quyết định nhanh

| Lựa chọn | Khi nào dùng | Ví dụ trong codebase |
|----------|----------------|------------------------|
| **Extend `BaseRepository<T>`** | CRUD / `QueryBuilder` đơn giản trên **một entity**, cần tái sử dụng `findById`, `transaction`, `query`, phân trang | `CurrencyRepository`, `WalletRepository`, `OrderRepository` |
| **Repository tùy biến (không extend Base)** | Chủ yếu gọi **stored procedure** (`CALL sp_*`) hoặc SQL đặc thù; ít dùng `repository.save` trực tiếp | `UsersRepository`, `AuthRepositoryImpl`, `MatchingRepository` |
| **Repository class + `DataSource` / `getRepository`** | Đã tách lớp data access nhưng logic không map gọn vào `BaseRepository` (multi-entity transaction, QB phức tạp) | `TreasuryOperationRepository`, `TreasuryTransactionWalletRepository` |
| **Service + `DataSource` trực tiếp** | Chỉ nên là **tạm thời** hoặc **legacy**; chuẩn dài hạn là đưa xuống repository | Ưu tiên refactor về repository (ví dụ `TreasuryMainWalletRepository`, `ManagedWalletsDataRepository`) |

---

## TransactionContext — Opaque Interface

Domain **không bao giờ import `EntityManager`** trực tiếp. Dùng `TransactionContext` (empty interface):

```typescript
// src/common/types/transaction-context.ts
export interface TransactionContext {}
```

Domain port nhận `TransactionContext`, infrastructure cast về `EntityManager`:

```typescript
// infrastructure/persistence/wallet-ledger.repository.impl.ts
function toEntityManager(ctx: TransactionContext): EntityManager {
 return ctx as unknown as EntityManager;
}

async createEntry(entry: LedgerEntryInput, ctx?: TransactionContext): Promise<WalletLedger> {
 const runner = ctx ? toEntityManager(ctx) : this.dataSource;
 // ...
}
```

---

## Ma trận hybrid: SP | ORM | QueryBuilder | Raw

Chọn **một** lớp chính cho mỗi thao tác; khi cần hai lớp (ví dụ SP ghi + QB đọc admin) phải có **lý do trong PR** hoặc **ADR** — xem [ARCHITECTURE.md](./ARCHITECTURE.md) (tổng quan kiến trúc + outbox/read model).

| Loại thao tác | Stored procedure | ORM (`find` / `save`) | QueryBuilder | Raw (ngoài `CALL`) |
|---------------|------------------|------------------------|--------------|---------------------|
| **Ghi nghiệp vụ nhiều bước / invariant** | Ưu tiên | Tránh (trừ transaction đơn giản một bảng) | Hiếm | Hiếm |
| **Đọc theo khóa / một dòng** | Tùy module | Thường dùng | Khi cần projection | Migration / seed |
| **Danh sách admin, filter động** | Có thể (SP tham số) | `find` + `where` đơn | Thường dùng | Khi plan đã tối ưu |
| **Migration / seed / DDL** | Không | Không | Không | Luôn |

### Default theo module (tham chiếu nhanh)

| Module / bounded context | Ghi chú ngắn |
|--------------------------|--------------|
| **Orders / Matching** | SP cho khớp lệnh / sổ lệnh; TS gọi qua repository + helper OUT param ([mysql-procedure-out-vars](../src/common/database/mysql-procedure-out-vars.ts)) |
| **Users / Auth** | Chủ yếu SP + chỗ filter list dùng QueryBuilder (`UsersRepository`); Auth dùng **Clean Architecture** (`domain/ports/`, `application/use-cases/`) |
| **Markets / Currencies / Wallets** | SP + `BaseRepository` tùy endpoint |
| **Treasury main wallet** | ORM qua `TreasuryMainWalletRepository`; service không `getRepository` |
| **Managed wallets (deposit UI)** | `ManagedWalletsDataRepository` + `TreasuryTransactionWalletRepository` |
| **Treasury operations / transaction wallets** | Repository + transaction nội bộ |

---

## Transaction: đặt ở đâu?

| Vị trí | Khi nào |
|--------|---------|
| **Repository** (ưu tiên) | Một aggregate / một nhóm bảng cố định trong module; ví dụ `clearDefaultAndSetMainWallet`, `setDefaultUserDepositInTransaction`. |
| **Service** (exception) | Orchestration **xuyên** nhiều repository không muốn gom transaction chung vào một "god repository"; phải **ghi rõ trong PR** và đảm bảo không trộn `CALL` + ORM trên hai connection khác nhau. |

---

## Hai cửa vào cùng aggregate (SP + QB/ORM) — danh sách kiểm

| Vị trí | Mô tả | Hành động đề xuất |
|--------|--------|-------------------|
| **Fiat deposit** | Ghi/đọc user qua SP; admin list qua QueryBuilder | Giữ QB: document filter/quyền tương đương; hoặc sau này gom SP có tham số filter. |
| *(bổ sung khi phát hiện thêm)* | … | ADR hoặc gom path |

---

## Database Procedure Pattern

- **Stored procedures** được định nghĩa trong **migrations** (`src/migrations`).
- **Repository** (hoặc lớp data access tương đương) gọi `dataSource.query('CALL sp_name(?, ?)', [params])`. Với OUT qua biến session MySQL (`@p_*`), dùng `selectMysqlUserVars` từ `src/common/database/mysql-procedure-out-vars.ts` để đọc thống nhất.
- **Service** không ghép chuỗi SQL động cho logic nghiệp vụ; tham số luôn bind qua placeholder.

---

## Transaction

- Ưu tiên bọc `dataSource.transaction` hoặc `BaseRepository.transaction` **trong repository**, expose một method nghiệp vụ (ví dụ `finalizeOperationWithOnchainRow`).
- **Service** gọi một method có tên rõ ý nghĩa domain, không lộ `EntityManager` ra controller.

---

## TypeORM entity và Repository pattern

- **Entity** = mapping bảng + quan hệ (`@Entity`, `@ManyToOne`, …).
- **Repository** = nơi tập trung `getRepository`, `createQueryBuilder`, `query` cho module đó.
- Tránh **Active Record kiểu** cô đặc: mọi thứ `getRepository` trong Service làm khó unit test và trùng lặp query.

---

## Kiểm chứng contract SP (integration)

- Spec ví dụ: `src/modules/matching/matching.ioc-fok.integration.spec.ts` — cần **MySQL đã chạy migration + procedure**, biến môi trường giống app. Dùng để bắt lệch contract TS ↔ SQL sau khi đổi SP.

---

## Unit of Work + transactional outbox (ghi nhất quán)

Một số luồng ghi (pilot: **markets**) cần **cùng một transaction** cho: cập nhật entity nghiệp vụ + hàng **`integration_outbox`**.

- **`UnitOfWork.run(callback)`** — cung cấp `EntityManager` / context cho callback; domain vẫn dùng `TransactionContext` opaque, infrastructure map sang manager.
- **Repository**: thêm method dạng `*WithinTransaction(..., manager)` khi cần tái sử dụng query trên connection đang mở transaction (tránh hai connection).
- **Outbox**: append payload + type sự kiện tích hợp trong transaction; relay (Bull) đọc và gọi handler (projector cập nhật `read_*`).

Chi tiết luồng và flag đọc projection: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Đọc từ read model (CQRS read side)

- Bảng ví dụ: **`read_market_pairs`** — đồng bộ từ integration event sau outbox, không thay thế entity ghi `market_pairs` trong mọi API.
- Query handler ứng dụng (`GetMarketPairQuery`) có thể chọn nguồn đọc theo **feature flag** env; khi bật, chỉ các filter đơn giản mới dùng projection (xem code handler).

## Liên kết

- [BASE_REPOSITORY_USAGE.md](./BASE_REPOSITORY_USAGE.md) — method list của `BaseRepository`.
- [REDIS_USAGE.md](./REDIS_USAGE.md) — cache / lock (không thay thế repository, bổ sung cho performance).
- [ARCHITECTURE.md](./ARCHITECTURE.md) — outbox, bus, projection pilot, ranh giới module.
