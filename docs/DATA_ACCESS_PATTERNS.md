# Quyết định tầng Data Access (Repository + ORM + Raw SQL)

Tài liệu này mô tả **khi nào** dùng `BaseRepository`, **repository tùy biến**, hoặc **Service inject `DataSource` trực tiếp** trong backend NestJS + TypeORM. Mục tiêu: tách **business orchestration** (Service) khỏi **persistence** (Repository), đồng thời giữ **KISS** — không ép một pattern cho mọi file.

**Xem thêm API cụ thể của `BaseRepository`:** [BASE_REPOSITORY_USAGE.md](./BASE_REPOSITORY_USAGE.md).

---

## Bảng quyết định nhanh

| Lựa chọn | Khi nào dùng | Ví dụ trong codebase |
|----------|----------------|------------------------|
| **Extend `BaseRepository<T>`** | CRUD / `QueryBuilder` đơn giản trên **một entity**, cần tái sử dụng `findById`, `transaction`, `query`, phân trang | `CurrencyRepository`, `WalletRepository`, `OrderRepository` |
| **Repository tùy biến (không extend Base)** | Dùng SQL/PostgreSQL đặc thù hoặc transaction nhiều bước; ít dùng `repository.save` trực tiếp | `UsersRepository`, `AuthRepositoryImpl`, `MatchingRepository` |
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

| Loại thao tác | Legacy migration SQL | ORM (`find` / `save`) | QueryBuilder | Raw SQL |
|---------------|------------------|------------------------|--------------|---------------------|
| **Ghi nghiệp vụ nhiều bước / invariant** | Ưu tiên | Tránh (trừ transaction đơn giản một bảng) | Hiếm | Hiếm |
| **Đọc theo khóa / một dòng** | Tùy module | Thường dùng | Khi cần projection | Migration / seed |
| **Danh sách admin, filter động** | Có thể (SP tham số) | `find` + `where` đơn | Thường dùng | Khi plan đã tối ưu |
| **Migration / seed / DDL** | Không | Không | Không | Luôn |

### Default theo module (tham chiếu nhanh)

| Module / bounded context | Ghi chú ngắn |
|--------------------------|--------------|
| **Orders / Matching** | Repository PostgreSQL-native cho khớp lệnh / sổ lệnh; không còn phụ thuộc OUT param/session variable kiểu MySQL |
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

## Database Query Pattern

- **Repository** (hoặc lớp data access tương đương) ưu tiên SQL/QueryBuilder/PostgreSQL-native transaction flow; không phụ thuộc `CALL sp_*` hay session variable kiểu MySQL trong runtime hiện tại.
- **Service** không ghép chuỗi SQL động cho logic nghiệp vụ; tham số luôn bind qua placeholder.
- Với legacy placeholder `?`, adapter PostgreSQL tại `src/common/database/pg-placeholder-adapter.ts` chỉ đóng vai trò transitional safety net trong lúc dọn nốt code cũ.

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

## Kiểm chứng contract query/integration

- Spec ví dụ: `src/modules/matching/matching.ioc-fok.integration.spec.ts` — khi bật chạy full app bootstrap sẽ kiểm tra contract NestJS ↔ PostgreSQL/infrastructure thực tế.

---

## Unit of Work + transactional outbox (ghi nhất quán)

Luồng ghi (**markets**, **on-chain deposits**, …) có thể dùng **cùng một transaction** cho: entity nghiệp vụ + append **`integration_outbox`**.

- **`UnitOfWork.run(callback)`** — `EntityManager` / context cho callback; domain dùng `TransactionContext`, infrastructure map sang manager.
- **Repository**: method `*WithinTransaction(..., manager)` khi cần cùng connection đang mở transaction.
- **Relay**: Bull gọi `OutboxRelayService.flushOnce` → **`OutboxIntegrationSyncService.dispatchRow`** cập nhật `read_*` + notification (đồng bộ, per-row transaction); xem [ARCHITECTURE_FULL_ROLLOUT.md](./ARCHITECTURE_FULL_ROLLOUT.md).

Chi tiết + flag env: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Đọc từ read model (CQRS read side)

- **`read_market_pairs`** — flag `READ_MARKETS_FROM_PROJECTION`; `GetMarketPairQuery` chỉ dùng projection khi filter đơn giản.
- **`read_onchain_deposits`** — flag `READ_MODEL_ONCHAIN_DEPOSITS`; listing deposit merge với nguồn ghi cho các loại không phải deposit.

## Liên kết

- [BASE_REPOSITORY_USAGE.md](./BASE_REPOSITORY_USAGE.md) — method list của `BaseRepository`.
- [REDIS_USAGE.md](./REDIS_USAGE.md) — cache / lock (không thay thế repository, bổ sung cho performance).
- [ARCHITECTURE.md](./ARCHITECTURE.md) — outbox relay, bus, read model, ranh giới module.
- [ARCHITECTURE_FULL_ROLLOUT.md](./ARCHITECTURE_FULL_ROLLOUT.md) — relay + on-chain read model.
