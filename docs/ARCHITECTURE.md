# Kiến trúc backend — trạng thái hiện tại

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
