# Kiến trúc backend — trạng thái hiện tại

> Last reviewed: 2026-08-05 — verified against `src/modules/system-config/`, `src/config/data-source.ts`, and `src/migrations/1700000002000-AddAuthSecurityCategoryToSystemConfigs.ts`.

Tài liệu này mô tả **những gì đã có trong mã nguồn** (outbox relay, CQRS bus, read model, UoW, ranh giới module). Biến env: [ENV_CONFIG_USAGE.md](ENV_CONFIG_USAGE.md). Checklist rollout: [ARCHITECTURE_FULL_ROLLOUT.md](ARCHITECTURE_FULL_ROLLOUT.md). Còn lại: [DATA_ACCESS_PATTERNS.md](DATA_ACCESS_PATTERNS.md), [REDIS_USAGE.md](REDIS_USAGE.md), [worker-pool-inventory.md](worker-pool-inventory.md).

## Tổng quan

- **NestJS + TypeORM + PostgreSQL** cho persistence chính; **Redis** cho cache, distributed lock, pub/sub và outbox relay coordination.
- **Clean Architecture** đầy đủ: `auth`, `orders` (và các module hybrid đang được tách lớp `application/queries` dần).
- **Transactional outbox** (`integration_outbox`): ghi cùng transaction với thay đổi nghiệp vụ; **Bull** (`outbox-relay`) + Redis lock gọi `OutboxRelayService.flushOnce`, mỗi dòng xử lý trong transaction riêng và gọi **`OutboxIntegrationSyncService.dispatchRow`** (đồng bộ read model + notification — không fire-and-forget qua `EventBus` cho luồng này).
- **`@nestjs/cqrs`**: `ApplicationBusModule` + `ApplicationBusService` (command/query bus ứng dụng).
- **Read model**: `read_market_pairs` + `READ_MARKETS_FROM_PROJECTION`; on-chain deposit **`read_onchain_deposits`** + `READ_MODEL_ONCHAIN_DEPOSITS` (chi tiết relay + merge: [ARCHITECTURE_FULL_ROLLOUT.md](ARCHITECTURE_FULL_ROLLOUT.md)).
- **DDD pilot**: aggregate ví dụ trong `orders` (domain), kèm spec — không bắt buộc mọi module đã có aggregate.
- **Ranh giới module**: `npm run lint:boundaries` (`scripts/check-module-boundaries.mjs` + allowlist tạm).

## Luồng ghi markets + outbox

1. `MarketsService` (ghi) chạy trong **`UnitOfWork.run`**.
2. Repository dùng **`createWithinTransaction` / `updateWithinTransaction`** trên cùng `EntityManager` với outbox.
3. **`OutboxAppender`** chèn hàng `integration_outbox` trong cùng transaction.
4. **`OutboxRelayService`** (Bull + Redis lock `outbox:relay:lock`) khóa từng dòng outbox, gọi **`OutboxIntegrationSyncService`**, rồi mới gán `published_at`. Đồng bộ `read_market_pairs` nằm trong dispatch (cùng pattern với pilot markets trong code).

Migration tạo bảng: `src/migrations/1776300000000-CreateIntegrationOutboxAndReadMarketPairs.ts`.

## Luồng đọc markets từ projection

- Khi `READ_MARKETS_FROM_PROJECTION=true|1|yes`, `GetMarketPairQuery.findAll` đọc từ `read_market_pairs` **chỉ khi** không cần ticker kèm list, không search/filter symbol phức tạp, không `sortBy` tùy biến — các trường hợp còn lại fallback `MarketsService` (nguồn ghi).
- **`findOne` / `findBySymbol` / `findActive`** vẫn qua service hiện tại (chưa chuyển hết sang projection).

**Vận hành:** bật flag production chỉ sau khi relay đã chạy ổn định và `read_market_pairs` đã được projector cập nhật; nếu không, list có thể thiếu hoặc lệch so với bảng ghi.

### Email verification runtime setting

`EMAIL_VERIFICATION_REQUIRED` là runtime setting kiểu boolean, mặc định `true` (secure by default), thuộc category `AUTH_SECURITY` (`auth_security` trong PostgreSQL enum `system_configs_category_enum`). Category này dành cho các toggle liên quan authentication/security và hiện chỉ chứa key này. `runtime-settings.definitions.ts` định nghĩa seed/whitelist; `SystemConfigService.isEmailVerificationRequired()` resolve theo DB → Redis cache → env `EMAIL_VERIFICATION_REQUIRED` → mặc định `true`.

Khi giá trị là `false`, backend bỏ qua toàn bộ email-OTP gate cho đổi mật khẩu, đổi email, contact-email OTP và thao tác thêm/xóa ví. Chỉ ADMIN có thể xem/sửa category qua `GET/PATCH /api/v1/system-configs/runtime/auth_security`; PATCH nhận bulk payload chứa `EMAIL_VERIFICATION_REQUIRED`. Endpoint single-key hiện có là `PATCH /api/v1/system-configs/EMAIL_VERIFICATION_REQUIRED` (không có segment `runtime`). Flutter hiển thị setting này trong tab **Auth & Security** của **Payment Configuration → Platform**, chỉ cho ADMIN.

### PostgreSQL enum migration ngoài transaction

`src/config/data-source.ts` và migration runner dùng `migrationsTransactionMode: 'each'`, nhưng PostgreSQL không cho phép `ALTER TYPE ... ADD VALUE` chạy trong transaction. Migration thêm `auth_security` vì vậy phải kiểm tra `queryRunner.isTransactionActive`, commit transaction do TypeORM mở (nếu có), chạy `ALTER TYPE "public"."system_configs_category_enum" ADD VALUE IF NOT EXISTS 'auth_security'` trên connection không có transaction, rồi mở transaction mới để phần migration tiếp theo vẫn an toàn. Xem `src/migrations/1700000002000-AddAuthSecurityCategoryToSystemConfigs.ts` làm reference implementation; không thay đổi migration này sau khi đã deploy.

## Observability

OpenTelemetry: span quanh **`UnitOfWork.run`**, **`OutboxRelayService.flushOnce`**, **`WorkerPoolService.run`** (Piscina).

## Tài liệu liên quan

| Tài liệu | Nội dung |
|----------|----------|
| [ARCHITECTURE_FULL_ROLLOUT.md](ARCHITECTURE_FULL_ROLLOUT.md) | Outbox relay (skip_locked, `published_at`), read on-chain deposits, notification idempotent |
| [bounded-contexts.md](bounded-contexts.md) | Bối cảnh giới hạn, ACL |
| [ubiquitous-language.md](ubiquitous-language.md) | Thuật ngữ |
| [DATA_ACCESS_PATTERNS.md](DATA_ACCESS_PATTERNS.md) | Repository, TransactionContext, UoW + outbox |
| [ENV_CONFIG_USAGE.md](ENV_CONFIG_USAGE.md) | Biến môi trường |
