# Full architecture rollout (personal project)

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
