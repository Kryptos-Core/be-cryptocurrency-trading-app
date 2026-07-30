# Go Real Traffic, Kafka Consumers, and Matching Mutation Plan

## Decision context

Production currently has no real users, so we can be more aggressive than a normal live trading rollout. However, order matching and wallet mutation still require guardrails because mistakes can corrupt balances/trades and make later testing unreliable.

This plan separates **real infrastructure traffic** from **real financial mutation**:

1. Enable real Kafka consumption in Go services first.
2. Enable real public market-data path only after protocol compatibility checks.
3. Keep matching-engine in shadow mutation mode until it can prove deterministic parity.
4. Only then allow order/balance/trade mutation, pair-by-pair, with DB backups and reconciliation.

## Current deployed state

Containers currently deployed:

- `crypto_market_aggregator` — healthy, shadow/read-only.
- `crypto_public_ws_gateway` — healthy, internal-only, canary 0%.
- `crypto_matching_engine` — healthy, shadow/read-only, `MUTATIONS_ENABLED=false`.
- `crypto_backend` — NestJS production source of truth.

Go binaries currently provide runtime health/metrics/logging skeletons. The next implementation work is real Kafka adapters and business logic.

## Important definition: mutation

`MUTATIONS_ENABLED=true` means the Go matching engine is allowed to write production state:

- update `orders.status`, `orders.filled_amount`, `orders.avg_price`
- insert rows into `trades`
- update `wallets.available` and `wallets.frozen`
- insert `wallet_ledger` rows
- emit `trade.executed`, `wallet.balance_changed`, and order lifecycle outbox events

`MUTATIONS_ENABLED=false` means Go can read real production events and calculate shadow results, but it must not change production order/trade/wallet state.

## Existing event sources

Configured Kafka topics observed in production:

- `crypto-trading.orderplaced`
- `crypto-trading.ordercancelled`
- `crypto-trading.tradeexecuted`
- `crypto-trading.walletbalancechanged`
- `crypto-trading.market.ticker`
- `market.ticker`

Canonical event types in TypeScript:

- `order.created`
- `order.cancel_requested`
- `order.cancelled`
- `order.rejected`
- `trade.executed`
- `wallet.balance_changed`
- `market.ticker_updated`

Payload contracts:

- `src/common/integration-events/order-lifecycle-outbox-payload.ts`
- `src/common/integration-events/trade-executed-outbox-payload.ts`

## Phase A — Real Kafka shadow consumers

### A1. market-aggregator

Implement a real Kafka consumer that reads:

- `crypto-trading.tradeexecuted`
- `crypto-trading.market.ticker`
- optionally `market.ticker`

Outputs:

- Prometheus counters:
  - `go_service_kafka_messages_total`
  - `go_service_kafka_errors_total`
  - `go_service_last_kafka_message_timestamp_seconds`
- JSON logs for consumed messages.
- Redis shadow keys under `shadow:go:market:*`.
- Redis pub/sub to NestJS-compatible channels only after payload contract validation:
  - `trading:external:ticker`
  - `trading:external:ohlc`

Initial mode:

```env
MARKET_AGGREGATOR_SHADOW_MODE=true
MARKET_AGGREGATOR_READ_ONLY_MODE=true
```

No DB mutations.

### A2. matching-engine shadow

Implement a real Kafka consumer that reads:

- `crypto-trading.orderplaced`
- `crypto-trading.ordercancelled`
- optionally `crypto-trading.tradeexecuted` for parity comparison

Outputs:

- shadow in-memory order book
- shadow fill logs
- parity metrics
- optional shadow Redis keys/table only, never production `orders/trades/wallets`

Initial mode:

```env
MATCHING_ENGINE_SHADOW_MODE=true
MATCHING_ENGINE_MUTATIONS_ENABLED=false
```

## Phase B — Public WS real traffic

The existing frontend contract is Socket.IO namespace `/trading`, not a raw WebSocket.

Before routing user traffic to `public-ws-gateway`, it must implement compatible behavior:

- Socket.IO or a proxy-compatible replacement for `/trading`
- `auth` message and `auth_response`
- `subscribe` / `unsubscribe`
- rooms equivalent:
  - `pair:{pair_id}:ticker`
  - `pair:{pair_id}:ohlc:{interval}`
- events:
  - `ticker`
  - `ohlc`
  - `workspace_restored` if needed, or documented omission for public-only mode

Canary progression:

```text
0% internal only
1% small canary
5%
25%
50%
100%
```

Since production has no real users, canary can move quickly, but only after an internal Socket.IO client passes.

Rollback:

```env
PUBLIC_WS_GATEWAY_CANARY_PERCENT=0
PUBLIC_WS_SOURCE=nestjs
```

## Phase C — Matching mutation preconditions

Do not set `MATCHING_ENGINE_MUTATIONS_ENABLED=true` until all checks pass:

1. DB backup taken.
2. Shadow matching consumes real events without panics/restarts.
3. Shadow fill parity is within threshold.
4. Idempotency is implemented for event offsets and trade IDs.
5. Reconciliation endpoints pass:
   - balances
   - trades
   - orderbook
   - outbox/Kafka
6. Kill-switch verified:
   - setting `MATCHING_ENGINE_MUTATIONS_ENABLED=false` stops writes.
7. Canary pair list configured:
   - `MATCHING_GO_CANARY_PAIRS=BTC_USDT` or equivalent.

## Phase D — Matching mutation controlled cutover

When ready, enable only one pair first:

```env
MATCHING_ENGINE_SHADOW_MODE=false
MATCHING_ENGINE_MUTATIONS_ENABLED=true
MATCHING_GO_CANARY_PAIRS=BTC_USDT
```

Required runtime behavior:

- if pair is not in canary list, Go must not mutate it.
- if any invariant fails, Go must stop matching and expose unhealthy readiness.
- all DB writes must happen inside one transaction.
- every consumed Kafka event must be idempotent.

Rollback:

```env
MATCHING_ENGINE_MUTATIONS_ENABLED=false
MATCHING_ENGINE_SHADOW_MODE=true
```

Then stop container if needed:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile go-risky stop matching-engine
```

## Implementation sequence for this repository

1. Add shared Go Kafka consumer support.
2. Add market-aggregator real Kafka shadow consumer.
3. Deploy and verify logs/metrics.
4. Add matching-engine real Kafka shadow consumer.
5. Deploy and verify logs/metrics.
6. Implement public-ws Socket.IO compatibility.
7. Run internal Socket.IO compatibility test.
8. Route public-ws traffic only after compatibility passes.
9. Implement matching mutation only after shadow parity is available.

## Current execution note

The immediate safe implementation is Phase A: real Kafka shadow consumption. It consumes real production Kafka traffic without mutating production state.

## Execution update - 2026-05-25 07:30 UTC

Implemented and deployed additional Phase A work:

- `market-aggregator` consumes real Kafka ticker events from `market.ticker`.
- It normalizes ticker payloads into the legacy NestJS-compatible Redis pub/sub format.
- It writes shadow Redis keys under `shadow:go:market:ticker:{pairId}`.
- It publishes live ticker messages to `trading:external:ticker` only when event timestamp is fresh.
- A freshness guard was added to prevent replaying historical Kafka backlog into the live websocket ingress:
  - default max age: `MARKET_AGGREGATOR_MAX_TICKER_AGE_SECONDS=30`
  - events too far in the future are ignored as well.

A temporary production test switched:

```env
TICKER_SOURCE=go_aggregator
```

Result:

- NestJS accepted the Go aggregator ingress and logged it as enabled.
- However, before the freshness guard was added, the Go service replayed Kafka backlog into Redis/NestJS and the backend hit Node.js heap out-of-memory.
- Immediate rollback was performed:

```env
TICKER_SOURCE=nestjs
```

Current safe production state after rollback:

- NestJS backend is healthy again.
- `market-aggregator` remains running in shadow/read-only mode.
- `matching-engine` remains running in shadow/read-only mode.
- `public-ws-gateway` remains internal/canary-0 only.
- No matching/order/balance/trade mutation is enabled.

Lesson:

- Do not point live websocket ingress at any Kafka consumer until historical backlog replay is blocked or the consumer starts from latest offset.
- Any Go-to-NestJS Redis pub/sub path must include freshness/rate limits and should be canaried with backend memory monitoring.

Next step before retrying `TICKER_SOURCE=go_aggregator`:

1. Confirm only fresh Kafka events are being published to Redis.
2. Optionally change consumer group or start policy so the live producer starts at latest offset, not oldest backlog.
3. Retry for a short observation window and monitor:
   - `crypto_backend` memory
   - backend logs for heap pressure
   - `go_service_redis_published_total`
   - websocket ticker delivery.
