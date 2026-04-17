# Worker pool inventory (CPU-bound tasks)

| Area | Task | Today | Recommendation |
|------|------|-------|------------------|
| Treasury | Ed25519 / secp256k1 key generation | Offloaded via Piscina (`crypto-account.worker`) | Keep; monitor `WorkerPool.run` span + `queueSize` |
| Reports / reconciliation | Large JSON / CSV transforms | Main thread | Move behind Piscina when runtime > 50ms p95 |
| Blockchain | Batch decode / verify signatures | Mixed | Profile first; pool if CPU-bound |
| Matching | Order book matching | Intentionally single-threaded Bull consumer | Do not pool; scale replicas with concurrency=1 |
| Outbox | Relay `flushOnce` + `OutboxIntegrationSyncService` (read model + notifications, per-row tx) | Bull `outbox-relay` + Redis `outbox:relay:lock` | Scale consumers; idempotent side-effects; [ARCHITECTURE.md](ARCHITECTURE.md), [ARCHITECTURE_FULL_ROLLOUT.md](ARCHITECTURE_FULL_ROLLOUT.md) |

Horizontal scale: prefer multiple Nest/Bull workers behind Redis-backed queues instead of Node `cluster` in-process when deploying containers.
