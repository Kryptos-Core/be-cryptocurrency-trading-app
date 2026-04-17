# Full architecture rollout

This document tracks the **Definition of Done** for bringing every bounded context to the same technical bar: Clean Architecture, DDD aggregates where invariants exist, transactional outbox for cross-context effects, CQRS command/query surfaces, `UnitOfWork` for writes, OpenTelemetry enrichment, and worker pools for CPU-heavy work.

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

## Module order (largest first)

See the approved plan in Cursor (Full-stack module hardening): `blockchain` → `matching` → `treasury` → … → small adapters.

## Decimal / base-unit helpers

Shared integer decimal helpers live in [`src/common/utils/base-units.ts`](../src/common/utils/base-units.ts) (used by matching, orders, and any new module).

## Blockchain — on-chain deposits (UoW + outbox)

`submitDeposit` and the confirming branch of `settleDepositByTxId` persist the on-chain row, optional wallet credit, and an integration outbox row in **one** `UnitOfWork.run` transaction. Wallet credits reuse the same transaction via `WalletsService.applyTransaction(userId, dto, joinTransaction)`.

| Outbox `event_type` | When |
|---------------------|------|
| `OnchainDeposit.Submitted@v1` | After each successful `submitDeposit` (payload includes `settled` when the chain tx was already confirmed). |
| `OnchainDeposit.Settled@v1` | After `settleDepositByTxId` completes on-chain confirmation and ledger settlement. |

Catalog entries: [`integration-event-catalog.ts`](../src/common/integration-events/integration-event-catalog.ts).

### Outbox relay semantics

The relay ([`OutboxRelayService`](../src/common/outbox/outbox-relay.service.ts)) drains `integration_outbox` without using the CQRS `EventBus` for delivery. For each pass it runs up to 50 iterations; **each iteration locks and processes at most one row** in its own database transaction.

- **Selection**: `published_at IS NULL`, `event_type` in the supported allow-list ([`outbox-relay-supported-event-types.ts`](../src/common/outbox/outbox-relay-supported-event-types.ts)), ordered by `occurred_at`, with **`pessimistic_write` + `skip_locked`** so a long-held lock on one row does not head-of-line block other workers.
- **`published_at`**: set only after [`OutboxIntegrationSyncService.dispatchRow`](../src/common/outbox/outbox-integration-sync.service.ts) completes without throwing — that runs the **read-model upsert** and **idempotent notification** writes on the **same `EntityManager`** as the outbox row update. If dispatch throws, the transaction rolls back and the row stays unpublished for retry.
- **Partial batch / failure**: If one row’s transaction fails after earlier rows in the same `flushOnce` already committed, those earlier rows remain published; the relay **stops further iterations** in that pass (the next scheduled flush retries). This matches per-row commits rather than one large transaction for the whole batch.

### On-chain deposit read model (`read_onchain_deposits`)

Projection is applied inside relay dispatch (not a separate async handler). The table is keyed by **`tx_id`** (internal id from the write path). **`OnchainDeposit.Submitted@v1`** establishes or refreshes the baseline row; **`OnchainDeposit.Settled@v1`** merges settlement fields. Optional **`UNIQUE (chain, tx_hash)`** is enforced when the migration defines it.

### Query path flag

When **`READ_MODEL_ONCHAIN_DEPOSITS=true`**, user-facing deposit listings merge **`read_onchain_deposits`** with non-deposit rows still read from `onchain_transactions` ([`ReadOnchainUserTransactionsQueryService`](../src/modules/blockchain/infrastructure/queries/read-onchain-user-transactions.query.service.ts)). When the flag is unset/false, queries use the legacy SQL only.

### Notifications idempotency

For on-chain deposit outbox events, **`notification_id` is the outbox row `id`** (deterministic, one notification per outbox row). Inserts use the caller’s transaction manager and treat **duplicate primary key** as success so concurrent workers cannot double-insert the same id.
