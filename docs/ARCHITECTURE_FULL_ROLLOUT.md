# Full architecture rollout

Checklist và ghi chép **cross-cutting**: UoW, transactional outbox + relay, read model, worker pool — bổ sung cho [ARCHITECTURE.md](./ARCHITECTURE.md).

## Platform building blocks

| Piece | Location |
|-------|----------|
| Integration event names | [`src/common/integration-events/integration-event-catalog.ts`](../src/common/integration-events/integration-event-catalog.ts) |
| Read model projector contract | [`src/common/read-model/read-model-projector.port.ts`](../src/common/read-model/read-model-projector.port.ts) |
| Worker pool task registry | [`src/common/worker-pool/worker-pool.registry.ts`](../src/common/worker-pool/worker-pool.registry.ts) |
| UoW | [`src/common/unit-of-work/`](../src/common/unit-of-work/) |
| Outbox + relay | [`src/common/outbox/`](../src/common/outbox/) |
| Application bus | [`src/common/application-bus/application-bus.service.ts`](../src/common/application-bus/application-bus.service.ts) (`executeCommand` / `executeQuery`) |
| HTTP span attributes | [`TelemetryContextInterceptor`](../src/common/interceptors/telemetry-context.interceptor.ts) |
| Module import boundaries | `npm run lint:boundaries` |
| Direct `dataSource.transaction` guard | `npm run lint:uow` |

## Orders ↔ Matching decoupling

Orders must not import `modules/matching/application/**`. Use [`ORDER_MATCHING_GATEWAY`](../src/modules/orders/domain/ports/order-matching-gateway.port.ts) implemented by [`OrderMatchingGatewayAdapter`](../src/modules/matching/infrastructure/adapters/order-matching-gateway.adapter.ts).

## Module dependency direction

Ưu tiên hướng phụ thuộng **domain nặng → adapter nhẹ**; kiểm tra bằng `npm run lint:boundaries` (allowlist trong script nếu cần).

## Decimal / base-unit helpers

[`src/common/utils/base-units.ts`](../src/common/utils/base-units.ts) — dùng chung matching, orders, module mới.

## Blockchain — on-chain deposits (UoW + outbox)

`submitDeposit` và nhánh xác nhận của `settleDepositByTxId` ghi on-chain row, credit ví (nếu có), và một dòng **`integration_outbox`** trong **một** `UnitOfWork.run`. Credit ví: `WalletsService.applyTransaction(..., joinTransaction)`.

| Outbox `event_type` | When |
|---------------------|------|
| `OnchainDeposit.Submitted@v1` | Sau `submitDeposit` thành công (payload có `settled` nếu tx chain đã confirmed). |
| `OnchainDeposit.Settled@v1` | Sau `settleDepositByTxId` hoàn tất xác nhận chain + ledger. |

Catalog: [`integration-event-catalog.ts`](../src/common/integration-events/integration-event-catalog.ts).

### Outbox relay

[`OutboxRelayService`](../src/common/outbox/outbox-relay.service.ts) đọc `integration_outbox` và gọi [`OutboxIntegrationSyncService.dispatchRow`](../src/common/outbox/outbox-integration-sync.service.ts) — **không** dùng CQRS `EventBus` cho đường giao này. Mỗi lần lặp (tối đa 50): **một transaction / tối đa một dòng** (`take(1)`), lock **`pessimistic_write` + `skip_locked`**, `event_type` trong allow-list ([`outbox-relay-supported-event-types.ts`](../src/common/outbox/outbox-relay-supported-event-types.ts)).

- **`published_at`**: chỉ set sau khi `dispatchRow` hoàn tất không throw (read model + notification trên **cùng `EntityManager`** với cập nhật outbox). Lỗi → rollback → row vẫn unpublished.
- **Lỗi giữa batch**: các dòng đã commit vẫn published; cùng một `flushOnce` **dừng** lặp tiếp; lần flush sau retry.

### Read model `read_onchain_deposits`

PK **`tx_id`**. `Submitted@v1` tạo/cập nhật baseline; `Settled@v1` merge settlement. Migration hiện **không** có `UNIQUE (chain, tx_hash)` — chỉ thêm khi invariant nghiệp vụ thật sự cần.

### Query flag

**`READ_MODEL_ONCHAIN_DEPOSITS=true`**: listing deposit user merge `read_onchain_deposits` + các type khác từ `onchain_transactions` ([`ReadOnchainUserTransactionsQueryService`](../src/modules/blockchain/infrastructure/queries/read-onchain-user-transactions.query.service.ts)). Tắt flag → SQL legacy.

### Notifications

**`notification_id` = `id` dòng outbox**. Insert idempotent (duplicate PK coi là OK) trong cùng transaction dispatch.
