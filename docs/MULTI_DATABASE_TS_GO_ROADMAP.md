# Lộ Trình Multi-Database + TypeScript/Go

> Phạm vi: kế hoạch chi tiết cho `be-cryptocurrency-trading-app`, tham khảo thiết kế tổng quan trong `docs/MULTIBLE_DATABASE.md` nhưng không áp dụng máy móc. Mục tiêu là đưa backend hiện tại sang kiến trúc multi-database, PostgreSQL làm source of truth, kết hợp TypeScript + Go và vẫn bảo toàn contract với FE.
>
> Nguyên tắc bắt buộc: trước khi thay đổi logic vận hành hoặc business logic, phải đánh giá tác động API lên FE. FE Flutter hiện phụ thuộc rất chặt vào REST `/api/v1`, Socket.IO `/trading` và Socket.IO `/notifications`.

---

## 0. Tiến Độ Thực Tế Cập Nhật (2026-04-25)

> Trạng thái này phản ánh **repo backend hiện tại** chứ không phải mục tiêu cuối cùng của toàn bộ roadmap. Kết luận ngắn: phần **PostgreSQL-only core source of truth** đã tiến rất xa và gần hoàn tất; phần **multi-database đầy đủ + Kafka/event bus mature + Go services + shadow/canary rollout** vẫn còn ở phía trước.

### 0.1 Tóm tắt tiến độ toàn cục

- **Nếu tính theo mục tiêu bắt buộc ngắn hạn**: backend đã đạt trạng thái **PostgreSQL-only core** và đang ở mức **gần hoàn tất**.
- **Nếu tính theo toàn bộ roadmap Multi-Database + TypeScript/Go**: roadmap **chưa hoàn thành**; nhiều phase dài hạn mới ở mức chuẩn bị thiết kế hoặc chưa bắt đầu implementation.

Ước lượng thực dụng:

| Phạm vi đánh giá | Tiến độ ước lượng | Ghi chú |
|---|---:|---|
| PostgreSQL-only core migration | 85-95% | Runtime, repo chính, lint/type/build/test đã ổn định |
| Toàn bộ roadmap multi-db + TS/Go | 40-55% | Nửa sau roadmap vẫn còn nhiều hạng mục lớn chưa triển khai |

### 0.2 Bảng trạng thái theo phase

| Phase | Mục tiêu | Trạng thái | Nhận định ngắn |
|---|---|---|---|
| Phase 0 | API contract baseline | Near complete | Đã có contract snapshot baseline cho nhóm REST/WS critical và script `contract:check`; phần còn lại là mở rộng coverage dần theo endpoint matrix |
| Phase 1 | Clean architecture database boundary | Near complete | Phần lớn boundary/repository ports/runtime PostgreSQL đã tách và vận hành được |
| Phase 2 | PostgreSQL core source of truth replacement | Near complete | Đây là phần tiến xa nhất; runtime đã PostgreSQL-only |
| Phase 3 | Market read model trên DB phụ | In progress | Đã có trades/ticker/OHLCV projection nền, read-path feature-flag, reconciliation + lag health/metrics/admin report; chưa hoàn tất Timescale end-to-end |
| Phase 4 | Event/outbox contract chuẩn cho TS và Go | Near complete | Contract/outbox foundation + production alert automation (severity-aware + state-change event + severity metric) đã có; còn lại chủ yếu là hardening Kafka vận hành dài hạn |
| Phase 5 | Go market aggregator | In progress (scaffold) | Đã có scaffold `go-services/market-aggregator`, chưa chạy shadow thực chiến |
| Phase 6 | Go matching engine shadow mode | In progress (scaffold) | Đã có shadow enqueue placeholder + artifact table, chưa có parity/canary đầy đủ |
| Phase 7 | Public WS gateway bằng Go | In progress (scaffold) | Đã có scaffold `go-services/public-ws-gateway`, chưa có traffic rollout |

### 0.3 Đã hoàn thành trong repo backend

#### A. PostgreSQL-only runtime core đã được chốt gần xong

- Runtime backend đã chuyển sang hướng **PostgreSQL-only** cho core persistence; build hiện tại không còn phụ thuộc MySQL runtime path.
- Đã thêm và kích hoạt `pg-placeholder-adapter` để chặn lỗi cú pháp từ placeholder legacy `?` trong giai đoạn chuyển tiếp.
- Các repository/runtime batch lớn đã được migrate hoặc chuẩn hóa theo PostgreSQL gồm:
  - blockchain
  - wallets
  - treasury
  - notifications
  - deposits
  - payment-config
  - currencies
  - auth/users
  - markets
  - orders
  - exchange
- Đã retire các helper/constants MySQL legacy khỏi runtime:
  - stored-procedure name constants
  - OUT-var helpers
  - stored-procedure result util
- Tài liệu trọng yếu đã được cập nhật theo trạng thái mới: PostgreSQL + Redis infra, PostgreSQL runtime config, và wording loại bỏ MySQL runtime claims.

#### B. Verify của repo hiện tại đang tốt

Trạng thái verify gần nhất của repo hiện tại là:

- `npm run lint -- --max-diagnostics=220` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run test -- --runInBand` ✅

Điều này cho thấy phần migration bắt buộc không chỉ “đổi code” mà còn đã đạt mức tương đối ổn định về chất lượng kỹ thuật.

#### C. Transaction / outbox / read-model nền tảng đã hiện diện trong runtime

- `src/common/unit-of-work` đã tồn tại và đang là ranh giới transaction quan trọng.
- `src/common/outbox` đã có transactional outbox pattern trong runtime.
- Relay hiện tại đã có:
  - lock phân tán bằng Redis
  - per-row transaction
  - chỉ set `published_at` sau khi side-effect sync thành công
- Read model sync / notification sync đã có ít nhất cho các luồng đang được áp dụng như market pairs và on-chain deposits.

#### D. Cập nhật mới nhất trong nhịp triển khai này: Phase 4 đã tiến thêm rõ rệt

Đã bổ sung thêm nhiều bước chuẩn hóa thực tế để phục vụ Phase 4:

- Thêm **canonical integration event envelope** trong runtime:
  - file: `src/common/integration-events/canonical-integration-event-envelope.ts`
- Update `OutboxAppender` để build/store envelope với metadata chuẩn hóa:
  - `eventId`
  - `eventType`
  - `aggregateType`
  - `aggregateId`
  - `occurredAt`
  - `schemaVersion`
  - `payload`
  - `correlationId`
  - `causationId`
  - `idempotencyKey`
  - `partitionKey`
- Đã mở rộng entity/schema `integration_outbox` theo hướng Kafka-ready hơn với các field:
  - `schema_version`
  - `correlation_id`
  - `causation_id`
  - `partition_key`
  - `kafka_topic`
  - `kafka_partition`
  - `kafka_offset`
  - `kafka_published_at`
  - `publish_attempts`
  - `last_publish_error`
- Đã thêm **publisher abstraction** và chọn driver theo env:
  - `noop`
  - `kafka`
- Đã scaffold `KafkaOutboxEventPublisher` và giữ `NoopOutboxEventPublisher` làm mặc định để không phá runtime hiện tại.
- Đã thêm `processed_integration_events` + consumer idempotency service cho read-model/notification sync hiện tại.
- Giữ **backward compatibility** với payload cũ của outbox hiện tại:
  - `OutboxIntegrationSyncService` có thể unwrap envelope mới nhưng vẫn đọc payload cũ
  - `OnchainDepositReadModelSyncApplierService` hỗ trợ cả envelope mới lẫn legacy payload
  - `OnchainDepositOutboxNotificationService` hỗ trợ cả envelope mới lẫn legacy payload
- Đã mở rộng event contracts thực chiến và nối được vào các flow hiện có:
  - `order.created`
  - `order.cancel_requested`
  - `order.cancelled`
  - `order.rejected`
  - `trade.executed`
  - `wallet.balance_changed`
- Mở thêm support read/notification path cho `DepositMatchedV1`.
- Tất cả các batch gần nhất đều đã verify pass ở mức test/type/lint.

Các file thay đổi chính trong các batch này gồm:

- `src/common/integration-events/canonical-integration-event-envelope.ts`
- `src/common/integration-events/integration-event-catalog.ts`
- `src/common/integration-events/onchain-deposit-outbox-payload.ts`
- `src/common/integration-events/order-lifecycle-outbox-payload.ts`
- `src/common/integration-events/trade-executed-outbox-payload.ts`
- `src/common/integration-events/wallet-balance-changed-outbox-payload.ts`
- `src/common/outbox/outbox-appender.service.ts`
- `src/common/outbox/outbox-appender.spec.ts`
- `src/common/outbox/outbox-integration-sync.service.ts`
- `src/common/outbox/outbox-integration-sync.service.spec.ts`
- `src/common/outbox/outbox-event-publisher.port.ts`
- `src/common/outbox/noop-outbox-event-publisher.service.ts`
- `src/common/outbox/kafka-outbox-event-publisher.service.ts`
- `src/common/outbox/processed-integration-events.service.ts`
- `src/common/outbox/processed-integration-events.service.spec.ts`
- `src/common/outbox/outbox-relay.service.ts`
- `src/common/outbox/outbox-relay.service.spec.ts`
- `src/common/outbox/outbox-relay-supported-event-types.ts`
- `src/common/outbox/outbox.module.ts`
- `src/common/read-model/onchain-deposit-read-model-sync-applier.service.ts`
- `src/modules/notifications/onchain-deposit-outbox-notification.service.ts`
- `src/modules/orders/application/use-cases/create-order.use-case.ts`
- `src/modules/orders/application/use-cases/create-order.use-case.spec.ts`
- `src/modules/orders/application/use-cases/cancel-order.use-case.ts`
- `src/modules/orders/application/use-cases/cancel-order.use-case.spec.ts`
- `src/modules/orders/orders.module.ts`
- `src/modules/wallets/application/use-cases/apply-transaction.use-case.ts`
- `src/modules/wallets/application/use-cases/apply-transaction.use-case.spec.ts`
- `src/modules/wallets/application/use-cases/admin-adjust-balance.use-case.ts`
- `src/modules/wallets/application/use-cases/admin-adjust-balance.use-case.spec.ts`
- `src/modules/wallets/wallets.module.ts`
- `src/modules/matching/infrastructure/persistence/matching.repository.ts`
- `src/modules/matching/infrastructure/persistence/matching.repository.spec.ts`
- `src/modules/matching/matching.module.ts`
- `src/entities/integration-outbox.entity.ts`
- `src/entities/processed-integration-event.entity.ts`
- `src/migrations/1776570000000-ExpandIntegrationOutboxPublisherMetadata.ts`
- `src/migrations/1776580000000-CreateProcessedIntegrationEvents.ts`

### 0.3.1 Cập nhật xác nhận batch mới nhất (Phase 4 production automation)

Batch mới nhất đã đóng phần **production automation** cho Outbox relay trong Phase 4, gồm:

- Relay health severity-aware (`none`/`warning`/`critical`) với warning + critical thresholds runtime-configurable.
- Scheduler automation (cron 30s) phát event state-change `outbox.relay.alert_state_changed` lên Redis channel cấu hình.
- Prometheus gauge `outbox_relay_alert_severity` (0/1/2) để alert pipeline có thể tự động hóa theo mức độ.
- Runtime knobs/env/system-config đầy đủ cho critical thresholds + automation enable/channel.
- Bộ test và docs/runbook đã cập nhật, verify pass:
  - `npm run lint -- --max-diagnostics=220`
  - `npx tsc --noEmit`
  - `npm run test -- --runInBand` (119 suites, 629 tests)
### 0.4 Chưa hoàn thành / còn dang dở có chủ đích

#### A. Dấu vết lịch sử migration MySQL vẫn còn trong repo

- Nhiều **migration lịch sử** vẫn chứa DDL/procedure MySQL cũ để bảo toàn historical trace; đây không còn là runtime source of truth hiện tại.
- Một số helper/spec/migration comments còn tồn tại để mô tả bối cảnh lịch sử migration MySQL -> PostgreSQL; cần dọn tiếp theo batch tài liệu nếu muốn repo “sạch dấu vết” hơn.

#### B. Phase 0 đã có baseline chạy được, còn mở rộng coverage theo thời gian

- Repo đã có tư duy **contract-first** rất rõ và roadmap đã liệt kê đầy đủ FE impact matrix.
- Tuy nhiên chưa xác nhận rằng toàn bộ:
  - OpenAPI export
  - response snapshot cho nhóm endpoint critical
  - Socket.IO payload snapshot
  - CI contract check
  đã được làm đầy đủ và enforced cho tất cả nhóm endpoint quan trọng.

=> Vì vậy Phase 0 hiện có thể đánh dấu **near complete**: đã có baseline contract-check vận hành, chưa phải finished vì coverage chưa bao phủ toàn bộ matrix endpoint/event.

#### C. Phase 3 đã bắt đầu implementation nhưng chưa hoàn tất rollout thực chiến

Đã có trong runtime hiện tại:

- entity/migration cho `read_market_trades` và `read_market_tickers`
- projection appliers cho `trade.executed` và `market.ticker_updated`
- `OutboxIntegrationSyncService` đã consume hai event này vào read-model
- repository đọc read-model + feature flag `MARKET_READ_SOURCE=postgres|timescale`
- read path đã nối cho:
  - `GET /markets/:id/trades`
  - `GET /markets/:id/ticker`
  - `GET /markets/tickers/all`
- reconciliation service bước đầu để so sánh `trades` core với `read_market_trades`

Chưa thấy / chưa hoàn chỉnh trong runtime hiện tại:\n\n- TimescaleDB hypertable/materialization/continuous aggregate đúng nghĩa\n- rollout chứng minh đầy đủ trên môi trường thực với backlog/projection lag dashboard\n- dashboard/alert policy production-grade cho projection lag và parity

=> Phase 3 hiện nên coi là **in progress**, đã có foundation khá rõ cho trades/ticker/OHLCV, on-demand admin reconciliation report, health payload và metrics collector, nhưng chưa hoàn tất rollout multi-db market read side.

#### D. Phase 4 đã gần hoàn tất (production automation đã đóng)

Đã có trong runtime hiện tại:

- canonical integration event envelope
- schema `integration_outbox` mở rộng với metadata publisher/Kafka-ready
- publisher abstraction + driver `noop|kafka`
- processed-event / idempotency tracking
- retry + dead-letter metadata
- admin replay/requeue cho dead-letter rows
- relay metrics/logging/health
- local sync path cho:
  - market pairs
  - onchain deposits
  - trade read-model
  - market ticker projection

Phần còn thiếu để coi là Phase 4 hoàn chỉnh tuyệt đối:

- Kafka publish path production-hardened hơn (topic governance, delivery guarantees, DLQ mature)
- observability sâu hơn cho lag / throughput / replay audit
- chuẩn hóa transaction boundary triệt để cho mọi emit path nhạy cảm

=> Phase 4 hiện có thể coi là **near complete**: phần production automation đã đóng; phần còn lại là hardening Kafka/ops observability nâng cao theo nhu cầu rollout thực tế.

#### E. Các phase Go / multi-db dài hạn chưa bắt đầu implementation thực sự

Chưa thấy các deliverable lớn sau trong repo runtime hiện tại:

- `go-services/market-aggregator`
- `go-services/matching-engine`
- shadow compare TS vs Go
- canary per pair
- public WS gateway bằng Go
- tách source market read/ticker/public WS thành rollout hoàn chỉnh

=> Các phase 5-7 về cơ bản vẫn **not started**.

### 0.5 Các việc nên làm tiếp để roadmap tiến thêm rõ ràng

Thứ tự hợp lý tiếp theo sau trạng thái hiện tại:

1. **Tiếp tục hoàn tất Phase 3**
   - chuyển từ projection schema hiện tại sang Timescale rollout thật nếu cần hypertable/continuous aggregate
   - thêm dashboard/alert cho projection lag, stale ticker, ohlcv drift
   - kiểm chứng performance/read parity trên staging load
2. **Phase 4 production automation đã hoàn thành; tiếp tục hardening có chọn lọc**
   - hardening Kafka/DLQ/observability khi bắt đầu tăng traffic/event bus
   - review transaction boundary cho các emit path nhạy cảm còn lại
3. **Sau khi Phase 3 ổn định mới bắt đầu Go aggregator**
   - shadow ticker / parity check
4. **Matching Go chỉ nên vào sau cùng**
   - shadow
   - canary
   - rollback đã test

### 0.6 Kết luận tiến độ thực tế

Có thể diễn đạt trạng thái hiện tại như sau:

- **Đã gần hoàn tất phần bắt buộc quan trọng nhất**: PostgreSQL-only core source of truth.
- **Chưa hoàn tất full roadmap**: multi-database read side, Kafka maturity, Go aggregator, Go matching shadow/canary và public WS split vẫn chưa xong.
- Repo hiện đang ở trạng thái phù hợp để bước sang giai đoạn tiếp theo là:
  - chuẩn hóa outbox/event contract sâu hơn
  - xây read-model DB phụ
  - rồi mới đưa Go vào đường đọc và sau đó mới tới matching.

## 1. Hiện Trạng Đã Ghi Nhận

### 1.1 Backend hiện tại

- Framework: NestJS modular monolith.
- Quyết định kiến trúc mới: loại bỏ hoàn toàn MySQL khỏi BE. PostgreSQL là database primary và source of truth cho core OLTP/core state gồm users, wallets, orders, trades, deposits, withdrawals và admin config.
- Các cấu hình, dependency, migration, stored procedure và repository đang gắn với MySQL phải được thay bằng PostgreSQL-native implementation.
- Core persistence mục tiêu dùng PostgreSQL transaction/function/index/constraint rõ ràng; không giữ MySQL compatibility layer trong runtime.
- Queue/cache/realtime: Redis, Bull, Socket.IO.
- Nền tảng tốt cần giữ lại:
  - `src/common/unit-of-work`: ranh giới transaction.
  - `src/common/outbox`: outbox/integration event pattern.
  - `src/modules/matching`: TypeScript matching engine, Redis lock theo `pairId`, in-memory order book.
  - `src/modules/trading/websocket/trading.gateway.ts`: Socket.IO namespace `/trading`.
  - `src/modules/notifications/notifications.gateway.ts`: Socket.IO namespace `/notifications`.

### 1.2 Frontend hiện tại

- FE là Flutter, gọi REST bằng Dio với base `/api/v1`.
- Endpoint constants tập trung tại `fe-cryptocurrency-trading-app/lib/core/constants/api_constants.dart`.
- Realtime market data dùng Socket.IO namespace `/trading`.
- Realtime private/admin notification dùng Socket.IO namespace `/notifications`.
- Nhiều parser FE đang đọc snake_case và một số fallback camelCase; không được đổi field nếu chưa có migration plan.

### 1.3 Khác biệt so với `MULTIBLE_DATABASE.md`

Tài liệu tham khảo mô tả kiến trúc exchange scale lớn với PostgreSQL/Kafka/Go đầy đủ. Roadmap này đi theo hướng đó: PostgreSQL làm source of truth, TimescaleDB cho market time-series, ClickHouse cho audit/analytics, Redis là cache/lock/queue, Go đảm nhiệm hot path. Vì yêu cầu là bỏ hoàn toàn MySQL, kế hoạch không duy trì MySQL runtime fallback.

- PostgreSQL là source of truth duy nhất cho OLTP/core state.
- MySQL bị loại khỏi dependency, env, Docker Compose, TypeORM config, migration scripts và repository runtime.
- Việc chuyển đổi schema/data là cutover có kiểm soát sang PostgreSQL, không giữ dual-write dài hạn với MySQL.
- Không thay REST/Socket.IO contract cho FE khi chưa có review.
- Sau khi PostgreSQL core ổn định mới thêm read-model/analytics database phụ và Go hot path.
- Dùng strangler pattern cho service/hot path, nhưng không dùng MySQL fallback trong kiến trúc mục tiêu.

---

## 2. Mục Tiêu Kiến Trúc

### 2.1 Mục tiêu ngắn hạn



- Đặt PostgreSQL làm source of truth duy nhất cho OLTP: users, wallets, orders, trades, deposits, withdrawals, admin config.
- Loại bỏ hoàn toàn MySQL khỏi BE runtime, test, seed, migration, Docker Compose và package dependencies.
- Thêm database phụ cho đọc/phân tích nhưng không đổi business logic:
  - TimescaleDB/PostgreSQL extension hoặc schema riêng cho OHLCV, recent trades, ticker projection.
  - ClickHouse chỉ thêm khi cần audit/report trên dữ liệu lớn.
- Chuẩn hóa outbox/event để Go services consume qua contract, không gọi trực tiếp vào business module.

### 2.2 Mục tiêu dài hạn

```text
Flutter FE
  | REST /api/v1 + Socket.IO compatibility
  v
NestJS API facade
  |-- PostgreSQL source of truth: users, wallets, orders, trades, ops state
  |-- Redis: cache, lock, Bull, Socket.IO adapter
  |-- TimescaleDB: market time-series/read model
  |-- ClickHouse: audit/analytics read model (optional)
  |-- Outbox/event bus: integration boundary
        |-- Go market aggregator
        |-- Go public WS gateway (optional)
        |-- Go matching engine (shadow -> canary -> primary)
```

### 2.3 Phân chia TypeScript và Go

| Domain | Ngôn ngữ khuyến nghị | Lý do |
|---|---|---|
| Auth, users, RBAC, admin | TypeScript/NestJS | CRUD/orchestration, gắn với controller hiện tại |
| Wallet ledger, deposit, withdrawal saga | TypeScript/NestJS | Business logic, cần transaction consistency, provider SDK JS |
| Orders API facade | TypeScript/NestJS | FE contract và validation hiện tại |
| Matching engine hiện tại | TypeScript trước, Go sau | Cần shadow/canary để tránh sai settlement |
| Market aggregator | Go | Hot path đọc trade stream, build OHLCV/ticker |
| Public market WS | Go optional | Khi Socket.IO/NestJS quá tải connection/broadcast |
| Private notification/user WS | TypeScript/NestJS | Gắn auth, RBAC, notification domain |
| Analytics sink | Go hoặc TypeScript | Batch insert, không phải business critical |

---

## 3. Nguyên Tắc Bắt Buộc Trước Khi Thay Đổi BE

1. Contract-first: endpoint nào FE đang dùng thì phải có snapshot response trước khi refactor.
2. Backward-compatible: được thêm field, không được rename/remove field nếu FE chưa update.
3. Feature flag cho mỗi nguồn dữ liệu mới:
   - `CORE_DB_SOURCE=postgres`
   - `MARKET_READ_SOURCE=postgres|timescale`
   - `TICKER_SOURCE=nestjs|go_aggregator`
   - `MATCHING_ENGINE=ts|go_shadow|go_canary|go`
   - `PUBLIC_WS_SOURCE=nestjs|go`
4. Dual-write phải đi qua outbox hoặc transitional adapter có idempotency; không viết DB primary + DB phụ tùy tiện trong business transaction.
5. Go service không được update production balances/trades cho đến khi có reconciliation và shadow parity.
6. Mọi thay đổi order/wallet status phải có FE impact review vì UI, localization và admin filters đang phụ thuộc status enum.

---

## 4. Clean Architecture Và SOLID Bắt Buộc Khi Implement

### 4.1 Quy tắc phân lớp

```text
src/modules/<domain>/
  domain/             # entities, value objects, domain services, repository ports
  application/        # use-cases, commands/queries, DTO nội bộ, transaction orchestration
  infrastructure/     # TypeORM/PostgreSQL adapters, Redis, Kafka/outbox, external clients
  interfaces/         # controllers, websocket gateways, HTTP DTOs, presenters
```

Dependency rule:

- `domain` không import NestJS, TypeORM, Redis, HTTP DTO, ConfigService.
- `application` chỉ phụ thuộc `domain` ports và UnitOfWork abstraction.
- `infrastructure` implement ports, chứa SQL/PostgreSQL details.
- `interfaces` map request/response, không chứa business logic.

### 4.2 Quy tắc SOLID

- Single Responsibility: controller chỉ xử lý HTTP/WS; use-case chỉ orchestration; repository chỉ persistence.
- Open/Closed: thêm PostgreSQL adapter bằng interface/implementation mới, không sửa use-case business logic nếu contract không đổi.
- Liskov Substitution: các PostgreSQL repository adapters phải trả đúng domain result/error semantics mà use-case mong đợi.
- Interface Segregation: tách read repository và write repository vì market read model khác core write model.
- Dependency Inversion: use-case phụ thuộc token/port, không inject `DataSource` trực tiếp.

### 4.3 Ranh giới repository/transaction

- Core write use-case phải chạy trong UnitOfWork: order create/cancel, trade execution, wallet adjustment, deposit settlement, withdrawal approval.
- PostgreSQL adapter chịu trách nhiệm SQL lock/transaction (`SELECT ... FOR UPDATE`, unique constraints, idempotency keys).
- Không tạo MySQL legacy adapter trong runtime mục tiêu; nếu cần đọc dữ liệu cũ để migrate thì dùng script offline riêng, không inject vào NestJS app.
- Không để Go service bypass application contract để ghi wallet/order/trade khi chưa có port/event contract rõ ràng.

### 4.4 Tách DTO/domain/database entity

- HTTP DTO FE-facing phải giữ backward-compatible.
- Domain object dùng naming sạch và invariant rõ; mapper chịu trách nhiệm snake_case/camelCase.
- Database entity không được leak trực tiếp ra controller nếu field DB có nguy cơ đổi khi migrate PostgreSQL.

---

## 5. Roadmap Theo Phase

### Phase 0 - API Contract Baseline

**Trạng thái hiện tại:** Near complete  
**Tiến độ ước lượng:** 80-90%

**Checklist trạng thái:**
- [x] Đã có contract snapshot baseline cho nhóm REST/WS critical tại `src/test/contracts`.
- [x] Đã có script `npm run contract:check` để khóa shape response/event trọng yếu.
- [x] Đã khóa baseline cho các nhóm critical đã triển khai:
  - REST: markets ticker/trades, orders create/cancel/my-orders
  - WS `/trading`: `ticker`, `ohlc`
  - WS `/notifications`: `auth_response`, `notification:new`, `wallet:balance`, `system_config:updated`
- [~] Coverage contract hiện chưa phủ full endpoint/event matrix; cần mở rộng dần theo API impact matrix.
- [~] Chưa có OpenAPI export/check gate ổn định trong CI pipeline.

Mục tiêu: khóa contract FE-critical trước mọi refactor/runtime rollout.

Deliverables:

- Baseline snapshot cho các endpoint/events Critical/High theo API impact matrix.
- CI step fail khi có thay đổi shape không chủ đích.
- Rule review bắt buộc cho mọi thay đổi enum/status/field FE-facing.

Acceptance criteria:

- `npm run contract:check` pass ổn định trên CI.
- Thay đổi shape response/event ngoài kế hoạch sẽ fail test snapshot.
- Có lộ trình mở rộng coverage đến full matrix endpoint/event.

### Phase 3 - Market Read Model Trên DB Phụ (Timescale Track)

**Trạng thái hiện tại:** In progress  
**Tiến độ ước lượng:** 65-80%

**Checklist trạng thái:**
- [x] Đã có projection schema nền cho `read_market_trades`, `read_market_tickers`, `read_market_ohlcv`.
- [x] Đã có projection worker path consume `trade.executed` qua outbox sync.
- [x] Đã có runtime read path dùng `MARKET_READ_SOURCE=postgres|timescale` với fallback cho:
  - `/markets/:id/trades`
  - `/markets/:id/ticker`
  - `/markets/tickers/all`
  - `/markets/:id/ohlcv`
  - `symbol -> ticker/trades`
- [x] Đã có reconciliation trades/tickers/OHLCV + admin on-demand report + pair-level details.
- [x] Đã có health payload (`/health/ready`) và Prometheus metrics cho drift/lag read-model.
- [x] Đã thêm severity metric `market_read_model_alert_severity` (0/1/2) + ngưỡng runtime-configurable:
  - `MARKET_READ_MODEL_ALERT_MAX_LAG_SECONDS`
  - `MARKET_READ_MODEL_ALERT_CRITICAL_MAX_LAG_SECONDS`
- [~] `MARKET_TS_DB` đã wiring ở mức runtime path/read repository, nhưng chưa chứng minh Timescale rollout production-grade đầy đủ.
- [~] Chưa có evidence rollout end-to-end (hypertable/materialization/continuous aggregate + dashboard/alert runbook production).

Mục tiêu: giảm tải PostgreSQL source-of-truth cho market read path mà không đổi REST/WS contract FE.

Deliverables:

- Timescale profile/dev service + migration path rõ cho hypertable/continuous aggregate/retention.
- Projection lag/parity observability đầy đủ (metrics + dashboard + alert policy).
- Báo cáo reconciliation phục vụ rollout gate theo window/pair.

Acceptance criteria:

- `MARKET_READ_SOURCE=postgres` và `MARKET_READ_SOURCE=timescale` trả response tương thích.
- FE chart/market list không cần đổi code.
- Có alert policy rõ cho lag/parity drift và evidence rollout staging/production.
### Phase 4 - Event/Outbox Contract Chuẩn Cho TS Và Go

**Trạng thái hiện tại:** Near complete  
**Tiến độ ước lượng:** 80-90%

**Checklist trạng thái:**
- [x] Transactional outbox pattern đã tồn tại trong runtime.
- [x] Relay hiện tại đã có lock Redis, per-row transaction và chỉ mark `published_at` sau khi sync side-effect thành công.
- [x] Đã bổ sung canonical integration event envelope.
- [x] `OutboxAppender` đã build/store canonical envelope với metadata chuẩn hóa bước đầu.
- [x] Đã giữ backward compatibility cho luồng sync/read-model/notification đang dùng payload legacy.
- [x] Đã mở thêm support cho `DepositMatchedV1`.
- [x] Event contract đã phủ thực tế orders/trades/wallet/ticker update và đã nối vào flow runtime chính.
- [x] Đã mở rộng schema `integration_outbox` với metadata chính cho publisher/Kafka-ready flow.
- [x] Đã có publisher abstraction + driver selection `noop|kafka` + Kafka publisher scaffold.
- [x] Đã có `processed_integration_events` + consumer idempotency cho read-model/notification sync hiện tại.
- [x] Đã mở rộng relay-health + Prometheus với backlog/dead-letter age signals (oldestUnpublishedAgeSeconds, oldestDeadLetterAgeSeconds), severity metric (`outbox_relay_alert_severity`), threshold alert policy runtime-configurable (warning + critical EVENT_OUTBOX_ALERT_*), replay audit trail (actor/reason/selected-vs-requeued rows + report file), và automation collector publish state-change event `outbox.relay.alert_state_changed` lên Redis channel cho runbook Kafka path.

Mục tiêu: tạo biên giới integration an toàn trước khi Go tham gia.

Deliverables:

- Chuẩn hóa event envelope:

```json
{
  "eventId": "uuid-v7",
  "eventType": "trade.executed",
  "aggregateType": "trade",
  "aggregateId": "trade_id",
  "occurredAt": "2026-04-25T00:00:00.000Z",
  "schemaVersion": 1,
  "correlationId": "...",
  "payload": {}
}
```

- Event names tối thiểu: `order.created`, `order.cancel_requested`, `order.cancelled`, `order.rejected`, `trade.executed`, `wallet.balance_changed`, `market.ticker_updated`.
  - Trạng thái hiện tại: đã nối thực tế `order.created`, `order.cancel_requested`, `order.cancelled`, `order.rejected`, `trade.executed`, `wallet.balance_changed`, `market.ticker_updated`.
- Idempotency rule: consumer lưu processed `eventId` hoặc natural key (`trade_id`, `order_id`); projection insert dùng upsert/do-nothing.
- Ban đầu dùng JSON schema để dễ debug; Protobuf chỉ thêm khi Go service ổn định và cần performance.

Acceptance criteria:

- Outbox retry không tạo duplicate projection/trade/ticker.
- Có DLQ/log cho event lỗi.
- Có relay-health severity-aware (none/warning/critical), state-change automation event `outbox.relay.alert_state_changed`, và metric `outbox_relay_alert_severity` cho giám sát production.

### Phase 5 - Go Market Aggregator Trước

**Trạng thái hiện tại:** In progress (scaffold)  
**Tiến độ ước lượng:** 15-25%

**Checklist trạng thái:**
- [x] Hướng kiến trúc đã xác định rõ: Go market aggregator là bước Go ưu tiên trước matching.
- [x] Đã có scaffold `go-services/market-aggregator` để chuẩn bị wiring CI/deploy.
- [~] Đã có skeleton service và config contract; chưa consume `trade.executed` thực chiến.
- [x] Đã có shadow compare NestJS emit payload vs Go ingress payload qua admin parity endpoint (`GET /trading/admin/public-ws-parity`).
- [~] Rollback flow bằng `TICKER_SOURCE=nestjs` đã được chuẩn hóa thêm qua runtime setting keys; vẫn cần diễn tập production rollout end-to-end.

Mục tiêu: đưa Go vào đường đọc market data, ít rủi ro hơn matching.

Deliverables:

- Tạo `go-services/market-aggregator`: consume `trade.executed`, update Redis ticker, insert/batch insert TimescaleDB, publish cache/event cho NestJS trading gateway.
- NestJS `MarketsController` vẫn là REST facade.
- Socket.IO `/trading` vẫn giữ event names `ticker`, `ohlc`, `dashboard_tickers`.

Acceptance criteria:

- So sánh ticker NestJS vs Go trong shadow mode.
- FE market list/chart không cần đổi endpoint.
- Rollback bằng `TICKER_SOURCE=nestjs`.

### Phase 6 - Go Matching Engine Shadow Mode

**Trạng thái hiện tại:** In progress (scaffold)  
**Tiến độ ước lượng:** 15-25%

**Checklist trạng thái:**
- [x] Chiến lược shadow -> canary -> primary đã được xác định trong roadmap.
- [x] Đã có scaffold `go-services/matching-engine` và runtime shadow job placeholder.
- [x] Đã có `shadow_matching_runs` artifact table + parity comparator endpoint (ops) để theo dõi drift theo pair/window.
- [~] Canary per pair đã có routing nền qua `MATCHING_ENGINE=go_canary` + `MATCHING_GO_CANARY_PAIRS`; chưa có Go matching executor thực chiến.
- [~] Đã có reconciliation artifact (unmatched order list + parity metrics), collector schedule + alert threshold, và readiness snapshot endpoint; vẫn cần dashboard UI production-grade.

Mục tiêu: kiểm chứng matching Go mà không ảnh hưởng tiền/user.

Deliverables:

- Tạo `go-services/matching-engine` nhận order events shadow.
- Không ghi production DB khi shadow.
- Output shadow trades vào log/table riêng gồm maker/taker order id, fill amount, price, final order state.
- Job compare output TypeScript matching vs Go matching theo pair/order.
- Feature flag theo `pairId`: `ts`, `go_shadow`, `go_canary`, `go`.

Acceptance criteria:

- Shadow parity gần 100% trên test data và staging load.
- Có rollback về TypeScript matching trong 1 config change.
- Có reconciliation wallet/order/trade sau mỗi canary window.

### Phase 7 - Public WS Gateway Bằng Go Nếu Cần

**Trạng thái hiện tại:** In progress (scaffold)  
**Tiến độ ước lượng:** 15-25%

**Checklist trạng thái:**
- [x] Mục tiêu tách public market WS khỏi NestJS đã được xác định về mặt kiến trúc.
- [x] Đã có scaffold `go-services/public-ws-gateway` để chuẩn bị rollout.
- [~] Đã có compatibility layer ở NestJS side: khi `TICKER_SOURCE=go_aggregator`, backend ingest Redis từ Go và vẫn emit nguyên contract `/trading`; cần hoàn thiện runbook cutover transport phía FE nếu rời Socket.IO.
- [x] Đã có public payload parity verification (`/trading/admin/public-ws-parity`) cho contract `TickerData` / `OHLCData`.
- [~] Đã chuẩn hóa runtime toggle `PUBLIC_WS_SOURCE`, thêm health/parity checks, go rollout readiness snapshot + history endpoint, và readiness signal (`go_rollout`) trong `/health/ready`; chưa có rollout song song production trong ít nhất một release.

Mục tiêu: scale connection/broadcast public market data mà không phá FE.

Deliverables:

- Go public WS gateway có thể dùng raw WebSocket hoặc Socket.IO compatible.
- Nếu raw WebSocket: FE phải có adapter mới và feature flag.
- Trong ít nhất 1 release, giữ `/trading` Socket.IO cũ.
- Private events `/notifications` giữ NestJS.

Acceptance criteria:

- FE có fallback về Socket.IO cũ.
- Public WS payload tương thích `TickerData`, `OHLCData` FE đang parse.

---

## 6. Data Ownership Để Tránh Dual-Write Sai

| Data/State | Source of truth | DB phụ/projection | Ghi chú |
|---|---|---|---|
| Users/auth/RBAC | PostgreSQL | None | Không cần Go |
| Wallet available/frozen | PostgreSQL | Analytics optional | Consistency-first, không eventual hóa tùy tiện |
| Wallet ledger | PostgreSQL | ClickHouse optional | Ledger là audit tài chính, append-only/immutable policy |
| Orders | PostgreSQL | ClickHouse optional | Status enum phải giữ FE compatibility |
| Trades | PostgreSQL | Timescale for market reads | Projection idempotent theo `trade_id` |
| OHLCV | PostgreSQL trades -> Timescale projection | Timescale | REST response giữ nguyên |
| Ticker 24h | PostgreSQL events -> Go aggregator + Redis | Timescale fallback | Feature flag source |
| Deposits/withdrawals | PostgreSQL | ClickHouse optional | Saga/status tác động FE cao |
| Notifications | PostgreSQL/Socket.IO | None | `/notifications` giữ NestJS |
| Admin audit | PostgreSQL outbox + ClickHouse optional | ClickHouse | Thêm sau khi cần report lớn |

---

## 7. API Impact Matrix Theo Endpoint FE Đang Dùng

Legend:

- Risk: Low/Medium/High/Critical.
- Policy: Safe = có thể đổi internal datasource nếu response không đổi; Additive only = chỉ thêm field; Contract lock = cần FE review/feature flag nếu đổi shape/status/semantics.

### 7.1 Core/system/auth/users

| Endpoint/Event | FE files/classes | Use case FE | Risk | Policy | Notes |
|---|---|---|---|---|---|
| `GET /health` | `auth_remote_datasource.dart`, app bootstrap | Kiểm tra server | Low | Safe | Giữ success/ok semantics |
| `GET /enums` | admin shared providers | Dropdown/filter admin | Medium | Additive only | Thêm enum ok; rename enum cần FE update |
| `GET /dashboard` | `dashboard_remote_datasource.dart`, `dashboard_provider.dart` | Home summary, top markets, wallets | High | Additive only | Market/wallet field rename sẽ làm home lỗi |
| `POST /auth/register` | `auth_remote_datasource.dart` | Đăng ký | High | Contract lock | Auth envelope/user shape cần giữ |
| `POST /auth/login` | `auth_remote_datasource.dart`, `auth_provider.dart` | Đăng nhập JWT | Critical | Contract lock | Token/user/role/permissions ảnh hưởng toàn app |
| `POST /auth/wallet-nonce` | wallet auth flow | Wallet login nonce | High | Contract lock | Nonce/message format gắn với signature |
| `POST /auth/wallet-verify` | wallet auth flow | Verify signature login | High | Contract lock | Chain/address/signature semantics cần FE change nếu đổi |
| `POST /auth/wallet/wc/init` | WalletConnect auth dialog | Init WC login | High | Additive only | Giữ `sessionId`, `wcUri` |
| `GET /auth/wallet/wc/status/:sessionId` | WalletConnect poller | Poll WC auth | High | Additive only | Status enum phải giữ |
| `POST /auth/wallet/wc/verify` | WalletConnect auth dialog | Complete WC login | High | Contract lock | Token/user response như login |
| `POST /auth/2fa/send-otp` | OTP dialog/auth provider | Gửi OTP | Medium | Additive only | Error code cần giữ |
| `POST /auth/2fa/validate-otp` | OTP dialog/auth provider | Validate OTP | Medium | Additive only | Không đổi success semantics |
| `POST /auth/2fa/enable` | Auth/security UI | Enable 2FA | High | Contract lock | Security action |
| `POST /auth/2fa/disable` | Auth/security UI | Disable 2FA | High | Contract lock | Security action |
| `POST /auth/change-password` | Auth/security UI | Change password | High | Contract lock | Error codes quan trọng |
| `GET /users` | admin users provider | Admin list users | Medium | Additive only | Pagination/envelope cần giữ |
| `GET /users/statistics` | admin/dashboard | User stats | Medium | Additive only | Analytics source có thể đổi nội bộ |
| `GET /users/me` | auth provider/user screens | Current profile | Critical | Contract lock | Role/permissions/profile field ảnh hưởng routing/RBAC |
| `PATCH /users/me/profile-basic` | profile edit | Cập nhật profile cơ bản | High | Additive only | Giữ validation errors |
| `POST /users/me/contact-email/send-otp` | profile/security | Send email OTP | Medium | Additive only |  |
| `POST /users/me/contact-email/verify` | profile/security | Verify contact email | Medium | Additive only |  |
| `POST /users/me/security-change-requests` | profile/security | Tạo request thay đổi security | High | Additive only | Status enum cần giữ |
| `POST /users/me/avatar` | profile avatar | Upload avatar | Medium | Additive only | Giữ URL/path semantics |
| `GET /users/security-change-requests/pending` | admin security | Pending approvals | Medium | Additive only |  |
| `POST /users/security-change-requests/:id/approve` | admin security | Approve | High | Contract lock | Admin workflow |
| `POST /users/security-change-requests/:id/reject` | admin security | Reject | High | Contract lock | Admin workflow |
| `GET /users/:id` | admin user detail | User detail | Medium | Additive only |  |
| `PATCH /users/:id` | admin user edit | Admin update | High | Contract lock | RBAC/status sensitive |
| `GET /users/:id/wallets` | admin user detail | User wallets | High | Additive only | Same wallet field policy |
| `GET /users/:id/onchain-transactions` | admin user detail | User tx list | High | Additive only | Status/chain enum stable |
| `GET /users/:id/security-changes` | admin user detail | Audit security changes | Medium | Additive only |  |
| `GET /users/:id/orders` | admin user detail | User orders | High | Additive only | Same order field policy |
| `DELETE /users/:id` | admin users | Delete/disable user | Critical | Contract lock | Destructive/security action |
| `PATCH /users/me/fcm-token` | FCM service | Save FCM token | Low | Additive only |  |

### 7.2 Markets/currencies/trading read APIs

| Endpoint/Event | FE files/classes | Use case FE | Risk | Policy | Notes |
|---|---|---|---|---|---|
| `GET /currencies` | `currencies_remote_datasource.dart`, admin currencies | Currency list/admin | Medium | Additive only | Pagination/envelope stable |
| `GET /currencies/active` | currency picker | Active currencies | Medium | Additive only |  |
| `GET /currencies/tradable` | market/order dropdowns | Tradable symbols | Medium | Additive only |  |
| `GET /currencies/:id` | currency detail | Detail | Medium | Additive only |  |
| `GET /currencies/symbol/:symbol` | currency lookup | Lookup by symbol | Medium | Additive only |  |
| `POST /currencies` | admin currencies | Create currency | High | Contract lock | Admin mutation |
| `PATCH /currencies/:id` | admin currencies | Update currency | High | Contract lock | Affects markets/order validation |
| `DELETE /currencies/:id` | admin currencies | Delete/deactivate | High | Contract lock | Affects dropdowns/orders |
| `GET /markets` | `markets_remote_datasource.dart`, market list/picker | Market list with filters/tickers | High | Additive only | Giữ data `{pairs,total,page,limit,tickers?}` |
| `GET /markets/active` | order pair picker, market maker | Active markets | High | Additive only |  |
| `GET /markets/tickers/all` | market list/dashboard fallback | All tickers | High | Additive only | Candidate chuyển source sang Go/Redis |
| `GET /markets/symbol/:symbol` | pair lookup | Lookup by symbol | Medium | Additive only | Symbol URL encoded |
| `GET /markets/symbol/:symbol/ticker` | market provider | Ticker by symbol | High | Additive only | Payload phải match ticker model |
| `GET /markets/symbol/:symbol/orderbook` | market provider | Order book by symbol | High | Additive only | Bids/asks shape stable |
| `GET /markets/symbol/:symbol/trades` | market provider | Recent trades by symbol | Medium | Additive only | Trade fields stable |
| `GET /markets/symbol/:symbol/depth` | market provider | Realtime depth by symbol | High | Additive only | Nếu source Go, shape stable |
| `GET /markets/:id` | market detail | Market detail by pairId | High | Additive only | FE uses `pairId`, `symbol`, base/quote data |
| `GET /markets/:id/ticker` | market detail/order screen | Ticker by pairId | High | Additive only | Candidate Go aggregator |
| `GET /markets/:id/orderbook` | market detail | Order book | High | Additive only | Do not rename `bids`, `asks` |
| `GET /markets/:id/ohlcv` | chart providers | Candles | High | Contract lock | Giữ interval/range support, timestamp units |
| `GET /markets/:id/trades` | market detail | Recent trades | Medium | Additive only |  |
| `GET /markets/:id/depth` | advanced trading/order book | Depth snapshot | High | Additive only |  |
| `POST /markets` | admin markets | Create pair | High | Contract lock | Affects order validation/pickers |
| `PATCH /markets/:id` | admin markets | Update pair | High | Contract lock | Affects fees/min/max/status |
| `DELETE /markets/:id` | admin markets | Soft delete pair | High | Contract lock | Affects FE active list |
| `POST /exchange/sync-info` | settings/admin markets | Sync Binance data | Medium | Contract lock | Admin operation |
| `GET /exchange-rates/market-prices` | deposits/market prices | Display market prices | Medium | Additive only | Can read from projection later |
| `GET /exchange-rates/deposit-preview` | deposit screen | Fiat/USDT preview | High | Contract lock | Money conversion UX |
| `GET /exchange-rates/admin/current-config` | admin payment config | Runtime rate config | Medium | Additive only |  |
| `POST /exchange-rates/admin/sync` | admin payment config | Sync rates | Medium | Contract lock |  |
| `PATCH /exchange-rates/admin/config` | admin payment config | Update rate config | High | Contract lock | Money conversion behavior |

### 7.3 Orders/matching APIs

| Endpoint/Event | FE files/classes | Use case FE | Risk | Policy | Notes |
|---|---|---|---|---|---|
| `POST /orders` | `orders_remote_datasource.dart`, `orders_provider.dart`, orders screen | Place order | Critical | Contract lock | Must preserve idempotency, validation errors, order shape |
| `POST /orders/batch` | market maker/admin | Place maker batch | Critical | Contract lock | Batch limit/errors stable |
| `GET /orders/admin/all` | admin transactions/users | Admin order monitor | High | Additive only | FE parses flexible maps but filters/status stable |
| `POST /orders/admin/reconcile-matching/:pairId` | admin transactions | Manual recovery | Critical | Contract lock | Ops endpoint; Go matching must preserve response |
| `GET /orders/book/:pairId?side=BUY|SELL` | `orders_remote_datasource.dart`, order screen | Side-specific book levels | High | Additive only | FE expects `price`, `remaining`, `order_count` |
| `GET /orders/my` | order screen | My orders paginated | High | Additive only | Giữ status enum OPEN/PARTIAL/FILLED/CANCELLED/REJECTED |
| `GET /orders/:orderId` | order detail/provider | One order | High | Additive only | Giữ `order_id`, `pair_id`, amounts/reserved fields |
| `POST /orders/:orderId/cancel` | order screen | Cancel order | Critical | Contract lock | Sync/async cancel semantics phải thông báo FE trước |
| `POST /orders/batch-cancel` | admin/market maker | Cancel batch | High | Contract lock |  |
| Socket.IO `/trading` emit `auth` | `websocket_service.dart`, `chart_provider.dart` | Authenticate WS | Critical | Contract lock | Giữ `{type:'auth',data:{token}}` |
| Socket.IO `/trading` emit `subscribe` | `websocket_service.dart` | Subscribe pair channels | Critical | Contract lock | Giữ `pair_id`, `channels`, `interval` |
| Socket.IO `/trading` emit `unsubscribe` | `websocket_service.dart` | Unsubscribe pair | Medium | Contract lock |  |
| Socket.IO `/trading` emit `join_dashboard` | dashboard provider | Join dashboard room | High | Contract lock |  |
| Socket.IO `/trading` event `auth_response` | chart/dashboard providers | WS auth result | Critical | Additive only |  |
| Socket.IO `/trading` event `ticker` | `TickerData.fromJson` | Realtime ticker | Critical | Additive only | Giữ snake_case: `pair_id`, `last_price`, `volume_24h`, etc. |
| Socket.IO `/trading` event `ohlc` | `OHLCData.fromJson` | Realtime candle | Critical | Additive only | Giữ `open_time`, `close_time`, `quote_volume`, `trades_count`, `is_closed` |
| Socket.IO `/trading` event `dashboard_tickers` | dashboard provider | Dashboard market refresh | High | Additive only | FE expects payload data list under `data` |
| Socket.IO `/trading` event `subscribed` | ws service | Subscription ack | Medium | Additive only |  |
| Socket.IO `/trading` event `unsubscribed` | ws service | Unsubscribe ack | Low | Additive only |  |
| Socket.IO `/trading` event `workspace_restored` | ws service | Reconnect restore | High | Additive only | Giữ `user_id`, `pairs`, `updated_at` |
| Socket.IO `/trading` event `error` | chart provider | WS error | High | Additive only | Giữ `code`, `message`, `details?` |

### 7.4 Wallets/ledger/deposits/blockchain

| Endpoint/Event | FE files/classes | Use case FE | Risk | Policy | Notes |
|---|---|---|---|---|---|
| `GET /wallets` | `wallets_remote_datasource.dart`, wallet screens | Wallet list | Critical | Contract lock | Giữ `available`, `frozen`, `total`, currency fields |
| `GET /wallets/balance` | `wallet_remote_datasource.dart`, orders screen | Balance by currency/pair | Critical | Contract lock | Order form depends available/frozen |
| `GET /wallets/ledger` | wallet detail | Ledger history | High | Additive only | Ledger transaction types stable |
| `POST /wallets/sync` | admin/debug | Sync wallets | Medium | Contract lock |  |
| `GET /wallets/exchange-balance` | wallet/admin | Exchange balance | Medium | Additive only |  |
| `GET /wallets/reconciliation-status` | wallet/admin | Reconciliation view | High | Additive only | Important for multi-db |
| `POST /wallets/reconciliation-report/export` | admin | Export reconciliation | Medium | Additive only |  |
| `POST /wallets/admin/adjust` | admin wallet adjust | Manual adjustment | Critical | Contract lock | Direct money mutation |
| `GET /wallets/admin/adjustments/:userId` | admin user detail | Adjustment history | High | Additive only |  |
| `GET /deposits` | deposits provider | My PayOS deposits | High | Additive only | Status enum stable |
| `POST /deposits` | deposits screen | Create PayOS deposit | Critical | Contract lock | Payment URL/orderCode semantics stable |
| `GET /deposits/checkout-meta` | deposits screen | Limits/config | High | Additive only | FE uses min/max/effective limits |
| `GET /deposits/:orderCode/sync-status` | deposits screen | Poll payment status | High | Additive only | Status stable |
| `GET /deposits/admin/all` | admin transactions | Admin deposit monitor | High | Additive only | Filters/status stable |
| `POST /deposits/payos-webhook` | PayOS external | Webhook | Critical | Contract lock | External provider contract |
| `GET /success`, `GET /cancel` | PayOS redirect | Browser redirect | Medium | Contract lock | User payment flow |
| `GET /deposit/methods` | deposit methods card | Public deposit methods | High | Additive only | Chain/recommended fields stable |
| `GET /blockchain/wallets` | blockchain provider | Linked wallets | High | Additive only | Chain/status enum stable |
| `POST /blockchain/wallets/request-link` | link wallet dialog | Create challenge | High | Contract lock | Message/signature flow |
| `POST /blockchain/wallets/verify-link` | link wallet dialog | Verify linked wallet | High | Contract lock |  |
| `GET /blockchain/wallets/:linkId/balance` | linked wallets | On-chain balance | Medium | Additive only |  |
| `DELETE /blockchain/wallets/:linkId` | linked wallets | Unlink wallet | High | Contract lock |  |
| `GET /blockchain/deposit/address` | onchain deposit | Deposit address | Critical | Contract lock | Chain/address availability drives UI |
| `GET /blockchain/deposit/preview` | onchain deposit | Preview tx | High | Contract lock |  |
| `POST /blockchain/deposit/submit` | onchain deposit | Submit tx hash | Critical | Contract lock | Idempotency/status stable |
| `POST /blockchain/deposit/:txId/settle` | admin/internal | Manual settle | Critical | Contract lock | Money mutation |
| `POST /blockchain/withdraw/request` | onchain withdraw | Request withdrawal | Critical | Contract lock | Saga/status/error codes affect FE |
| `POST /blockchain/withdraw/manual/:txId/approve` | admin withdrawal | Approve withdrawal | Critical | Contract lock |  |
| `POST /blockchain/withdraw/manual/:txId/reject` | admin withdrawal | Reject withdrawal | Critical | Contract lock |  |
| `POST /blockchain/withdraw/manual/process-pending` | admin withdrawal | Process queue | High | Contract lock |  |
| `GET /blockchain/transactions` | blockchain provider | User on-chain tx history | High | Additive only | Status/chain enum stable |
| `GET /blockchain/transactions/:txId` | blockchain/admin | Tx detail | High | Additive only |  |
| `GET /blockchain/admin/withdrawals/stats` | admin withdrawal | Stats | Medium | Additive only |  |
| `GET /blockchain/admin/withdrawals` | admin withdrawal | Withdrawal list | High | Additive only |  |
| `GET /blockchain/admin/withdrawals/:txId` | admin withdrawal | Withdrawal detail | High | Additive only |  |
| `GET /blockchain/networks` | chain picker | Network catalog | High | Additive only | Chain codes must stay stable |
| `POST /blockchain/admin/deposits/ingest` | admin transactions | Ingest unmatched deposits | High | Contract lock |  |
| `GET /blockchain/admin/deposits/unmatched` | admin transactions | Unmatched deposits | Medium | Additive only |  |
| `POST /blockchain/admin/deposits/:txId/match-user` | admin transactions | Match deposit to user | Critical | Contract lock | Money mutation |
| `POST /blockchain/wallets/wc/init` | wallet connect linking | Init WC session | High | Additive only | Giữ `sessionId`, URI/proposal |
| `GET /blockchain/wallets/wc/status/:sessionId` | WC poller | Poll session | High | Additive only | Status enum stable |
| `POST /blockchain/wallets/wc/submit` | WC linking | Submit signature | High | Contract lock |  |
| `POST /blockchain/wallets/wc/relay-webhook` | WC relay/internal | Webhook | Medium | Contract lock |  |
| `POST /internal/deposit-watcher/refresh` | internal/admin | Refresh watcher | Medium | Contract lock | Not direct FE but ops critical |

### 7.5 Managed wallets/treasury/payment config/admin ops

| Endpoint/Event | FE files/classes | Use case FE | Risk | Policy | Notes |
|---|---|---|---|---|---|
| `GET /managed-wallets` | managed wallets provider | User deposit/managed wallets | High | Additive only | Chain/status stable |
| `POST /managed-wallets` | managed wallets provider | Create managed wallet | Critical | Contract lock | Key/address operation |
| `GET /managed-wallets/deposit-defaults` | deposits/managed wallets | Default deposit addresses | High | Additive only |  |
| `PATCH /managed-wallets/settings/recommended-chain` | managed wallets | Recommended chain | Medium | Contract lock |  |
| `GET /managed-wallets/:walletId` | wallet detail | Detail | High | Additive only |  |
| `GET /managed-wallets/:walletId/transactions` | wallet detail | Tx list | High | Additive only |  |
| `POST /managed-wallets/:walletId/send` | managed wallet send | Send tx | Critical | Contract lock | Money/on-chain mutation |
| `PATCH /managed-wallets/:walletId/set-deposit-default` | managed wallets | Set default | High | Contract lock | Deposit UX impact |
| `PATCH /managed-wallets/:walletId/clear-deposit-default` | managed wallets | Clear default | High | Contract lock | Deposit UX impact |
| `DELETE /managed-wallets/:walletId` | managed wallets | Delete/deactivate | Critical | Contract lock | Address availability impact |
| `GET /payment-configs` | admin payment config | List configs | Medium | Additive only |  |
| `GET /payment-configs/options` | admin payment config | Form options | Medium | Additive only |  |
| `GET /payment-configs/:id` | admin payment config | Detail | Medium | Additive only |  |
| `POST /payment-configs` | admin payment config | Create config | High | Contract lock | Payment behavior |
| `PUT /payment-configs/:id` | admin payment config | Update config | High | Contract lock | Payment behavior |
| `POST /payment-configs/:id/activate` | admin payment config | Activate config | High | Contract lock |  |
| `DELETE /payment-configs/:id` | admin payment config | Delete config | High | Contract lock |  |
| `GET /treasury/chain-picker-options` | treasury providers | Chain dropdowns | High | Additive only | Chain codes stable |
| `GET /treasury/wallets` | treasury provider | Transaction wallets | High | Additive only |  |
| `POST /treasury/wallets` | treasury provider | Create transaction wallet | Critical | Contract lock | Key/address operation |
| `GET /treasury/wallets/:walletId` | treasury detail | Wallet detail | High | Additive only |  |
| `POST /treasury/wallets/:walletId/sweep` | treasury ops | Sweep funds | Critical | Contract lock | Money/on-chain mutation |
| `POST /treasury/wallets/:walletId/fund` | treasury ops | Fund wallet | Critical | Contract lock | Money/on-chain mutation |
| `DELETE /treasury/wallets/:walletId` | treasury ops | Delete wallet | Critical | Contract lock |  |
| `GET /treasury/main-wallets` | treasury main wallets | Main wallet list | High | Additive only |  |
| `GET /treasury/main-wallets/pending` | admin approval | Pending wallets | High | Additive only |  |
| `POST /treasury/main-wallets` | treasury main wallets | Create/import main wallet | Critical | Contract lock | Key custody sensitive |
| `PATCH /treasury/main-wallets/:id/approve` | admin approval | Approve main wallet | Critical | Contract lock |  |
| `PATCH /treasury/main-wallets/:id/reject` | admin approval | Reject main wallet | High | Contract lock |  |
| `PATCH /treasury/main-wallets/:id/set-default` | treasury main wallets | Set default | Critical | Contract lock | Sweep/fund routing |
| `POST /treasury/main-wallets/:id/reveal-private-key` | treasury main wallets | Reveal private key | Critical | Contract lock | Security critical |
| `PATCH /treasury/main-wallets/:id` | treasury main wallets | Update label/config | High | Contract lock |  |
| `PATCH /treasury/main-wallets/:id/request-deletion` | treasury main wallets | Request deletion | Critical | Contract lock |  |
| `PATCH /treasury/main-wallets/:id/approve-deletion` | treasury main wallets | Approve deletion | Critical | Contract lock |  |
| `PATCH /treasury/main-wallets/:id/reject-deletion` | treasury main wallets | Reject deletion | High | Contract lock |  |
| `GET /treasury/operations` | treasury history | Ops list | High | Additive only |  |
| `GET /treasury/operations/:operationId` | treasury history | Ops detail | Medium | Additive only |  |
| `POST /treasury/operations/:operationId/manual-retry` | treasury ops | Retry operation | Critical | Contract lock |  |
| `POST /treasury/operations/:operationId/manual-abort` | treasury ops | Abort operation | Critical | Contract lock |  |
| `POST /treasury/operations/:operationId/manual-settle` | treasury ops | Manual settle | Critical | Contract lock |  |
| `GET /treasury/transactions` | treasury history | Tx history | High | Additive only |  |
| `GET /system-configs/runtime` | runtime settings provider | Runtime settings | Medium | Additive only |  |
| `PATCH /system-configs/runtime` | runtime settings | Bulk update runtime | High | Contract lock |  |
| `GET /system-configs` | admin settings | List configs | Medium | Additive only |  |
| `PATCH /system-configs/:key` | admin settings | Update config | High | Contract lock |  |
| `GET /market-maker/defaults` | market maker screen | Defaults | Medium | Additive only |  |
| `GET /market-maker/config` | market maker screen | List config | Medium | Additive only |  |
| `GET /market-maker/config/:pairId` | market maker screen | Pair config | Medium | Additive only |  |
| `PUT /market-maker/config/:pairId` | market maker screen | Update config | High | Contract lock |  |
| `DELETE /market-maker/config/:pairId` | market maker screen | Delete config | High | Contract lock |  |
| `POST /market-maker/place/:pairId` | market maker screen | Place maker orders | Critical | Contract lock | Calls orders batch behavior |
| `POST /market-maker/refresh/:pairId` | market maker screen | Refresh config/orders | High | Contract lock |  |
| `GET /market-maker/dashboard` | market maker screen | Dashboard | Medium | Additive only |  |

### 7.6 Notifications

| Endpoint/Event | FE files/classes | Use case FE | Risk | Policy | Notes |
|---|---|---|---|---|---|
| `GET /notifications` | notification datasource/provider | Notification list | Medium | Additive only |  |
| `POST /notifications` | admin broadcast | Create notification | Medium | Contract lock |  |
| `GET /notifications/unread-count` | notification provider | Badge count | Medium | Additive only |  |
| `PATCH /notifications/read-all` | notification provider | Mark all read | Medium | Contract lock |  |
| `PATCH /notifications/:id/read` | notification provider | Mark one read | Medium | Contract lock |  |
| Socket.IO `/notifications` emit `auth` | `notifications_socket_service.dart` | Auth namespace | Critical | Contract lock | Giữ token payload |
| Socket.IO `/notifications` event `auth_response` | notifications socket service | Auth result | High | Additive only |  |
| Socket.IO `/notifications` event `notification:new` | notification provider | New notification | High | Additive only |  |
| Socket.IO `/notifications` event `payment_config:event` | payment config provider | Refresh payment config | High | Additive only |  |
| Socket.IO `/notifications` event `treasury:event` | treasury/payment UI | Refresh treasury data | High | Additive only |  |
| Socket.IO `/notifications` event `wallet:balance` | wallets provider | Wallet realtime update | Critical | Additive only | Giữ balance field semantics |
| Socket.IO `/notifications` event `system_config:updated` | system config provider | Runtime config update | Medium | Additive only |  |

---

## 8. Quy Tắc FE Compatibility Cho Mọi BE Change

### 8.1 Field rules

- Money/decimal fields phải giữ dạng string nếu hiện tại là string: `available`, `frozen`, `amount`, `price`, `filled_amount`, `avg_price`, `reserved_quote`, `reserved_base`.
- Nếu cần thêm numeric optimized field, thêm field mới ví dụ `priceNumber`, không thay `price`.
- Giữ snake_case cho order/trade/wallet payload hiện tại vì FE models đang parse snake_case.
- Có thể thêm camelCase song song nếu cần, nhưng không xóa snake_case.

### 8.2 Status enum rules

Không đổi các enum sau nếu không có FE migration:

- Order: `OPEN`, `PARTIAL`, `FILLED`, `CANCELLED`, `REJECTED`.
- Order side/type: `BUY`, `SELL`, `LIMIT`, `MARKET`.
- Time in force: `GTC`, `IOC`, `FOK`.
- On-chain tx/withdraw/deposit statuses đang hiển thị trên FE.
- Chain codes: `TRON_*`, `SOLANA_*`, `BSC_*`, EVM codes trong chain picker.

Nếu cần thêm status mới:

1. Thêm FE fallback display trước.
2. Release FE.
3. BE mới bắt đầu emit status mới.

### 8.3 Error code rules

- FE có localization theo `code`; giữ các code hiện có.
- Nếu thêm code mới, FE phải có fallback generic và localization sau.
- Không thay error HTTP status nếu FE đang xử lý riêng flow, đặc biệt auth/order/wallet/treasury.

---

## 9. Testing/Verification Plan

### 9.1 Contract tests

- Snapshot response cho endpoint Critical/High.
- Test remove/rename field sẽ fail.
- Test status enum output nằm trong allowlist.
- Test Socket.IO payload có field bắt buộc.

### 9.2 Data consistency tests

- Wallet invariant: `available >= 0`, `frozen >= 0`, `available + frozen = expected total` theo ledger.
- Order invariant: `filled_amount <= amount`, status phù hợp fill.
- Trade invariant: trade amount/price khớp maker/taker order state.
- Projection invariant: Timescale trade count theo `trade_id` = PostgreSQL trades count trong window.

### 9.3 Shadow/canary tests cho Go

- Shadow compare TypeScript matching vs Go matching trên cùng order stream.
- Canary theo allowlist pairId, không canary toàn bộ.
- Tự động rollback nếu mismatch trade output, wallet reconciliation fail, order status drift, hoặc FE error rate tăng.

---

## 10. Deployment Và Rollback

### 10.1 Config/env đề xuất

```env
CORE_DB_SOURCE=postgres
CORE_DB_TYPE=postgres
CORE_DB_HOST=127.0.0.1
CORE_DB_PORT=5432

MARKET_READ_SOURCE=postgres
MARKET_TS_ENABLED=false
MARKET_TS_HOST=127.0.0.1
MARKET_TS_PORT=5432

ANALYTICS_ENABLED=false
CLICKHOUSE_URL=http://127.0.0.1:8123

EVENT_OUTBOX_ENABLED=true
EVENT_SCHEMA_FORMAT=json

TICKER_SOURCE=nestjs
MATCHING_ENGINE=ts
MATCHING_GO_CANARY_PAIRS=
PUBLIC_WS_SOURCE=nestjs
```

### 10.2 Rollback rules

- Core PostgreSQL issue: rollback bằng database backup/restore hoặc blue-green PostgreSQL deployment; không rollback về MySQL.
- Market read issue: set `MARKET_READ_SOURCE=postgres`.
- Go ticker issue: set `TICKER_SOURCE=nestjs`.
- Go matching issue: set `MATCHING_ENGINE=ts`, disable canary pairs.
- Public WS issue: FE feature flag/base URL về `/trading` Socket.IO cũ.
- Projection lag issue: REST fallback về PostgreSQL, projection replay sau.

---

## 11. Việc Không Nên Làm Trong Giai Đoạn Đầu

- Không triển khai Go matching primary khi PostgreSQL core source of truth chưa ổn định.
- Không để Go matching ghi trực tiếp wallets/trades production khi chưa shadow parity.
- Không thay Socket.IO `/trading` bằng raw WebSocket nếu FE chưa có adapter/fallback.
- Không đổi order cancellation từ sync sang async mà không thêm UI status `cancel_requested`/pending.
- Không đưa Redis thành source of truth cho balance/order.
- Không giữ MySQL runtime fallback; nếu cần import dữ liệu cũ thì dùng script offline, sau đó xóa khỏi runtime BE.

---

## 12. Checklist Trước Mỗi Phase

### Trước Phase 1

- [ ] API impact matrix được review với FE.
- [ ] Critical endpoints có contract snapshots.
- [ ] Error code convention được ghi lại.

### Trước Phase 2

- [ ] PostgreSQL schema/core adapters đã có.
- [ ] Script import dữ liệu cũ sang PostgreSQL, nếu cần, đã test offline.
- [ ] `CORE_DB_SOURCE=postgres` hoạt động trên app, seed, migration, test.
- [ ] Reconciliation core state trên PostgreSQL có report.

### Trước Phase 3

- [ ] Timescale schema và projection idempotency đã có.
- [ ] Feature flag `MARKET_READ_SOURCE` hoạt động.
- [ ] Reconciliation PostgreSQL vs Timescale có report.

### Trước Phase 5

- [ ] Event envelope đã ổn định.
- [ ] Go aggregator chạy shadow không ảnh hưởng REST.
- [ ] Ticker/OHLCV parity được đo.

### Trước Phase 6

- [ ] Matching Go có unit/benchmark tests.
- [ ] Shadow compare có dashboard/report.
- [ ] Rollback về TS matching đã test.
- [ ] Wallet/order/trade reconciliation pass.

---

## 13. Kết Luận

Hướng đi phù hợp nhất cho dự án là tiến hóa có kiểm soát:

1. Khóa API contract vì FE đang phụ thuộc nhiều endpoint và Socket.IO events.
2. Áp dụng Clean Architecture/SOLID để tách domain/application khỏi database infrastructure.
3. Loại bỏ hoàn toàn MySQL và thay bằng PostgreSQL làm source of truth cho core OLTP.
4. Thêm multi-database ở read side, đặc biệt market data.
5. Chuẩn hóa outbox/event contract.
6. Đưa Go vào market aggregator trước.
7. Đưa Go matching engine vào shadow/canary sau cùng.

Cách này đạt mục tiêu multi-database + TypeScript/Go nhưng vẫn bảo vệ business logic hiện tại và giảm tối đa việc FE phải sửa bất ngờ.








