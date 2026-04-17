# Kiến trúc backend — trạng thái hiện tại

Tài liệu này mô tả **những gì đã có trong mã nguồn** (outbox, CQRS bus, read projection pilot, UoW, ranh giới module). Chi tiết vận hành: [ENV_CONFIG_USAGE.md](ENV_CONFIG_USAGE.md), [DATA_ACCESS_PATTERNS.md](DATA_ACCESS_PATTERNS.md), [REDIS_USAGE.md](REDIS_USAGE.md), [worker-pool-inventory.md](worker-pool-inventory.md).

## Tổng quan

- **NestJS + TypeORM (MySQL)** cho persistence; **Redis** cho cache, lock matching, và lock relay outbox.
- **Clean Architecture** đầy đủ: `auth`, `orders` (và các module hybrid đang được tách lớp `application/queries` dần).
- **Transactional outbox** (`integration_outbox`): ghi cùng transaction với thay đổi nghiệp vụ; **Bull** (`outbox-relay`) đẩy sự kiện sang handler / projector.
- **`@nestjs/cqrs`**: `ApplicationBusModule` + `ApplicationBusService` (command/query bus toàn app).
- **Read model pilot**: bảng `read_market_pairs` + flag `READ_MARKETS_FROM_PROJECTION` (chỉ một số đường đọc list đơn giản).
- **DDD pilot**: aggregate ví dụ trong `orders` (domain), kèm spec — không bắt buộc mọi module đã có aggregate.
- **Ranh giới module**: `npm run lint:boundaries` (`scripts/check-module-boundaries.mjs` + allowlist tạm).

## Luồng ghi markets + outbox

1. `MarketsService` (ghi) chạy trong **`UnitOfWork.run`**.
2. Repository dùng **`createWithinTransaction` / `updateWithinTransaction`** trên cùng `EntityManager` với outbox.
3. **`OutboxAppender`** chèn hàng `integration_outbox` trong cùng transaction.
4. **`OutboxRelayService`** (Bull job + Redis lock `outbox:relay:lock`) xử lý publish; handler đồng bộ read model (ví dụ `MarketPairReadModelHandler`).

Migration tạo bảng: `src/migrations/1776300000000-CreateIntegrationOutboxAndReadMarketPairs.ts`.

## Luồng đọc markets từ projection

- Khi `READ_MARKETS_FROM_PROJECTION=true|1|yes`, `GetMarketPairQuery.findAll` đọc từ `read_market_pairs` **chỉ khi** không cần ticker kèm list, không search/filter symbol phức tạp, không `sortBy` tùy biến — các trường hợp còn lại fallback `MarketsService` (nguồn ghi).
- **`findOne` / `findBySymbol` / `findActive`** vẫn qua service hiện tại (chưa chuyển hết sang projection).

**Vận hành:** bật flag production chỉ sau khi relay đã chạy ổn định và `read_market_pairs` đã được projector cập nhật; nếu không, list có thể thiếu hoặc lệch so với bảng ghi.

## Observability

- OpenTelemetry: span quanh **`UnitOfWork.run`**, flush relay outbox, và **`WorkerPoolService.run`** (Piscina). Bổ sung gauge/metric theo nhu cầu triển khai.

## Tài liệu liên quan

| Tài liệu | Nội dung |
|----------|----------|
| [bounded-contexts.md](bounded-contexts.md) | Bối cảnh giới hạn, ACL |
| [ubiquitous-language.md](ubiquitous-language.md) | Thuật ngữ |
| [DATA_ACCESS_PATTERNS.md](DATA_ACCESS_PATTERNS.md) | Repository, TransactionContext, UoW + outbox |
| [ENV_CONFIG_USAGE.md](ENV_CONFIG_USAGE.md) | Biến môi trường |
