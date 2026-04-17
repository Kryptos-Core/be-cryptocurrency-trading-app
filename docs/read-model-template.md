# Read model / projection template

1. **Migration** — add `read_<aggregate>` table (denormalized columns + `updated_at`).
2. **Outbox row** — in the same DB transaction as the write, append `integration_outbox` with a stable `event_type` (e.g. `Entity.Created@v1`) and JSON payload.
3. **Relay** — extend [`OutboxRelayService.toIntegrationEvent`](../src/common/outbox/outbox-relay.service.ts) to map `event_type` → Nest `IEvent`.
4. **Handler** — `@EventsHandler(...)` implements [`ReadModelProjector`](../src/common/read-model/read-model-projector.port.ts) pattern (idempotent upsert by natural key).
5. **Query side** — `QueryHandler` or `*Query` class reads from `read_*` behind a feature flag until cutover.

Register the string in [`integration-event-catalog.ts`](../src/common/integration-events/integration-event-catalog.ts) when the type is part of the public contract.
