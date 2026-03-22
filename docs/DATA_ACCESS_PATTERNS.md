# Quyết định tầng Data Access (Repository + ORM + Stored Procedure)

Tài liệu này mô tả **khi nào** dùng `BaseRepository`, **repository tùy biến**, hoặc **Service inject `DataSource` trực tiếp** trong backend NestJS + TypeORM. Mục tiêu: tách **business orchestration** (Service) khỏi **persistence** (Repository), đồng thời giữ **KISS** — không ép một pattern cho mọi file.

**Xem thêm API cụ thể của `BaseRepository`:** [BASE_REPOSITORY_USAGE.md](./BASE_REPOSITORY_USAGE.md).

---

## Bảng quyết định nhanh

| Lựa chọn | Khi nào dùng | Ví dụ trong codebase |
|----------|----------------|------------------------|
| **Extend `BaseRepository<T>`** | CRUD / `QueryBuilder` đơn giản trên **một entity**, cần tái sử dụng `findById`, `transaction`, `query`, phân trang | `CurrencyRepository`, `WalletRepository`, `OrderRepository` |
| **Repository tùy biến (không extend Base)** | Chủ yếu gọi **stored procedure** (`CALL sp_*`) hoặc SQL đặc thù; ít dùng `repository.save` trực tiếp | `UsersRepository`, `AuthRepository`, `MatchingRepository` |
| **Repository class + `DataSource` / `getRepository`** | Đã tách lớp data access nhưng logic không map gọn vào `BaseRepository` (multi-entity transaction, QB phức tạp) | `TreasuryOperationRepository`, `TreasuryTransactionWalletRepository` |
| **Service + `DataSource` trực tiếp** | Chỉ nên là **tạm thời** hoặc **legacy**; chuẩn dài hạn là đưa xuống repository | Đang loại bỏ dần tại các module treasury / managed-wallets |

---

## Database Procedure Pattern

- **Stored procedures** được định nghĩa trong **migrations** (`src/migrations`).
- **Repository** (hoặc lớp data access tương đương) gọi `dataSource.query('CALL sp_name(?, ?)', [params])`.
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

## Liên kết

- [BASE_REPOSITORY_USAGE.md](./BASE_REPOSITORY_USAGE.md) — method list của `BaseRepository`.
- [REDIS_USAGE.md](./REDIS_USAGE.md) — cache / lock (không thay thế repository, bổ sung cho performance).
