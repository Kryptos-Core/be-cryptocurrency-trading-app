# Lộ Trình Multi-Database + TypeScript/Go

> Phạm vi: kế hoạch chi tiết cho `be-cryptocurrency-trading-app`, tham khảo thiết kế tổng quan trong `docs/MULTIBLE_DATABASE.md` nhưng không áp dụng máy móc. Mục tiêu là đưa backend hiện tại sang kiến trúc multi-database, PostgreSQL làm source of truth, kết hợp TypeScript + Go và vẫn bảo toàn contract với FE.
>
> Nguyên tắc bắt buộc: trước khi thay đổi logic vận hành hoặc business logic, phải đánh giá tác động API lên FE. FE Flutter hiện phụ thuộc rất chặt vào REST `/api/v1`, Socket.IO `/trading` và Socket.IO `/notifications`.

---

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

Mục tiêu: khóa lại hành vi API hiện tại để refactor không phá FE.

Deliverables:

- Export OpenAPI từ NestJS Swagger.
- Tạo contract snapshot cho nhóm endpoint FE dùng nhiều:
  - Auth/users/profile.
  - Markets/tickers/orderbook/OHLCV/trades.
  - Orders create/cancel/my/book/admin.
  - Wallets/balance/ledger/admin adjust.
  - Deposits/blockchain/managed-wallets/treasury.
  - Socket.IO `/trading` và `/notifications` event payload.
- Thêm CI check cho response shape tối thiểu.
- Tạo changelog API nội bộ: mỗi PR có BE API change phải ghi `FE impact: none/low/medium/high`.

Acceptance criteria:

- Có danh sách endpoint FE đang dùng và file FE liên quan.
- Có test fail nếu field core bị rename/remove.
- Có convention versioning: thêm endpoint `/v2` hoặc field mới nếu cần thay payload lớn.

### Phase 1 - Clean Architecture Database Boundary, Chưa Đổi Logic

Mục tiêu: chuẩn bị code để có nhiều DataSource mà không đổi business behavior.

Deliverables:

- Tạo database provider naming: `CORE_DB` (PostgreSQL source of truth), `MARKET_TS_DB` (TimescaleDB), `ANALYTICS_DB` (ClickHouse).
- Thêm repository ports theo Clean Architecture, application layer chỉ phụ thuộc interface, không phụ thuộc TypeORM/DataSource trực tiếp.
- Audit mọi repository/service inject trực tiếp `DataSource`; phân loại core write, market read, admin analytics.
- Tách SQL/PostgreSQL functions ra infrastructure adapters; use-case không biết chi tiết SQL.
- Thêm health checks riêng cho PostgreSQL/cache/queue, sau đó thêm TimescaleDB/ClickHouse.
- Không sửa business behavior tạo order/cancel/trade settlement ở phase này.

Acceptance criteria:

- App chạy bằng PostgreSQL-only (`CORE_DB_SOURCE=postgres`).
- Không còn MySQL env/dependency/runtime provider.
- Database phụ có thể tắt/bật bằng env mà không ảnh hưởng endpoint hiện tại.

### Phase 2 - PostgreSQL Core Source Of Truth Replacement

Mục tiêu: thay toàn bộ MySQL bằng PostgreSQL trong BE, giữ REST/Socket.IO contract và business behavior. Đây là phase bắt buộc trước khi triển khai TimescaleDB/ClickHouse/Go theo kiến trúc multi-db.

Deliverables:

- Thay `mysql2`/MySQL TypeORM config bằng PostgreSQL driver/config (`pg`) và PostgreSQL DataSource.
- Thiết kế PostgreSQL schema source of truth cho users, wallets, wallet_ledgers, orders, trades, market_pairs, currencies, deposits, withdrawals, outbox.
- Chuyển stored procedures quan trọng sang PostgreSQL functions hoặc transactional repository methods, nhưng application use-case chỉ gọi repository ports.
- Viết migration PostgreSQL-native: constraints, partial indexes, `SELECT ... FOR UPDATE`, idempotency keys, numeric precision, enums/check constraints.
- Viết script import dữ liệu cũ nếu cần, chạy offline một lần; script này không trở thành dependency runtime của BE.
- Xóa MySQL env vars, Docker service, package dependency, migration scripts, stored procedure names và code path MySQL khỏi BE sau khi PostgreSQL tests pass.

Acceptance criteria:

- PostgreSQL là source of truth duy nhất cho core state.
- Không còn MySQL dependency/runtime config trong BE.
- Contract tests FE pass 100%.
- Wallet/order/trade reconciliation pass trên PostgreSQL.
- `npm run migration:*`, seed, test, Docker infra hoạt động với PostgreSQL.

### Phase 3 - Market Read Model Trên Database Phụ

Mục tiêu: giảm tải PostgreSQL source of truth cho chart/ticker/trades mà không đổi REST contract.

Deliverables:

- Thêm TimescaleDB/PostgreSQL dev service vào compose riêng hoặc optional profile.
- Tạo schema projection:
  - `market_trades(time, pair_id, symbol, price, amount, taker_side, trade_id)`.
  - `ohlcv_1m`, `ohlcv_5m`, `ohlcv_15m`, `ohlcv_1h`, `ohlcv_4h`, `ohlcv_1d`.
  - `ticker_24h_projection` nếu cần materialized/cache fallback.
- Projection worker consume outbox/event `trade.executed` từ PostgreSQL source of truth; poll PostgreSQL trades có cursor chỉ là fallback.
- REST endpoints giữ nguyên: `/markets/:id/ohlcv`, `/markets/:id/trades`, `/markets/:id/ticker`, `/markets/tickers/all`.

Acceptance criteria:

- `MARKET_READ_SOURCE=postgres` và `MARKET_READ_SOURCE=timescale` trả response tương thích.
- FE chart/market list không cần sửa code.
- Có reconciliation job so sánh count/latest trade giữa PostgreSQL và Timescale.

### Phase 4 - Event/Outbox Contract Chuẩn Cho TS Và Go

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
- Idempotency rule: consumer lưu processed `eventId` hoặc natural key (`trade_id`, `order_id`); projection insert dùng upsert/do-nothing.
- Ban đầu dùng JSON schema để dễ debug; Protobuf chỉ thêm khi Go service ổn định và cần performance.

Acceptance criteria:

- Outbox retry không tạo duplicate projection/trade/ticker.
- Có DLQ/log cho event lỗi.

### Phase 5 - Go Market Aggregator Trước

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
