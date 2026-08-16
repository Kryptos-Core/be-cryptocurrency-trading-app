# Kafka KRaft Mode (KIP-500)

This document describes how the project runs Apache Kafka in **KRaft combined mode** (Kafka Raft metadata) instead of the legacy ZooKeeper-based metadata quorum. It captures the rationale, the exact configuration we ship, the operational commands that verify it works, and how to recover or roll back.

> Audience: backend / DevOps engineers who bring up or troubleshoot the Kafka profile in any environment (dev / staging / prod).

## 1. Why KRaft

| | ZK mode (legacy) | KRaft mode (current) |
|---|---|---|
| Required components | Kafka broker + ZooKeeper ensemble | Kafka broker only |
| Metadata quorum | ZooKeeper ensemble (`zk:2181`) | Internal `__cluster_metadata` topic replicated via Raft |
| Startup dependency chain | Broker waits for ZK healthy | No external dependency |
| Failure modes to handle | `NodeExistsException` loops (commit log in `docs/KAFKA_LOCAL_DEV_LIFECYCLE.md`) | Stale `__cluster_metadata` log on disk |
| KIP-833 status | Deprecated | Production-ready since Kafka 3.5/Confluent 7.5 |
| Operational surface | 2 services × 2 healthchecks | 1 service × 1 healthcheck |

We chose **single-broker combined mode** (`PROCESS_ROLES=broker,controller`) because the cluster has exactly one broker in every environment today. Combined mode means the same JVM process acts as both broker and controller — fine for dev/staging and for our current RF=1 prod footprint.

## 2. Configuration we ship

All five compose files (`docker-compose.infrastructure.{development,staging,prod}.yml`, `docker-compose.{staging,prod}.yml`) use the same Kafka image (`confluentinc/cp-kafka:7.6.1`) and the same KRaft env block. The block is:

```yaml
environment:
  KAFKA_NODE_ID: 1
  KAFKA_PROCESS_ROLES: 'broker,controller'
  KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:9093'
  KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER'
  CLUSTER_ID: 'MkU3OEVBNTcwNTJENDM2Qk'
  KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_EXTERNAL:PLAINTEXT'
  KAFKA_LISTENERS: 'PLAINTEXT://0.0.0.0:9092,PLAINTEXT_EXTERNAL://0.0.0.0:${KAFKA_EXTERNAL_PORT:-29092},CONTROLLER://0.0.0.0:9093'
  KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka:9092,PLAINTEXT_EXTERNAL://${APP_HOSTNAME}:${KAFKA_EXTERNAL_PORT:-29092}'
  KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
  KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
  KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
  KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
  KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true'
  KAFKA_LOG_RETENTION_HOURS: 168
  KAFKA_DATA_DIRS: /var/lib/kafka/data
  TZ: 'UTC'
```

Key choices:

- **`CLUSTER_ID`** is fixed (`MkU3OEVBNTcwNTJENDM2Qk`, the Confluent example UUID). Single-broker combined mode does not require auto-generation; baking it in keeps restarts idempotent and avoids a one-time bootstrap step.
- **`CONTROLLER` listener** binds on `:9093` on the loopback interface inside the container. It is **never advertised** to clients; `KAFKA_ADVERTISED_LISTENERS` only exposes `PLAINTEXT` and `PLAINTEXT_EXTERNAL`.
- **`KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1` / `MIN_ISR=1`** are set so transactional producers (we do not currently use them, but the outbox relay is the candidate) do not fail on a 1-broker cluster.
- **`KAFKA_AUTO_CREATE_TOPICS_ENABLE=true`** is preserved from the legacy compose so that the existing outbox relay (`crypto-trading.*` topics) works without manual topic creation.
- The healthcheck `kafka-broker-api-versions --bootstrap-server localhost:9092` works identically in KRaft — the broker still speaks the same Kafka wire protocol.

### Listeners

| Name | Bound to | Advertised as | Purpose |
|---|---|---|---|
| `PLAINTEXT` | `0.0.0.0:9092` | `kafka:9092` | Internal Docker network traffic (Go services, NestJS) |
| `PLAINTEXT_EXTERNAL` | `0.0.0.0:29092` | `${APP_HOSTNAME}:${KAFKA_EXTERNAL_PORT:-29092}` | Host-machine tooling, dev scripts, NestJS container-to-host |
| `CONTROLLER` | `0.0.0.0:9093` | (not advertised) | Internal Raft metadata quorum |

## 3. Bringing it up

Per environment:

```bash
# Dev
docker compose --env-file .env.development -f docker-compose.infrastructure.development.yml --profile kafka up -d

# Staging
docker compose --env-file .env.staging -f docker-compose.infrastructure.staging.yml --profile kafka up -d

# Production
docker compose --env-file .env.prod -f docker-compose.infrastructure.prod.yml --profile kafka up -d
```

A successful first boot emits (in `docker logs`):

```
[KafkaServer id=1] started
Registered listener CONTROLLER://0.0.0.0:9093
[ControllerQuorumAgent id=1] Becoming the active controller
```

There is **no** ZooKeeper log line. If you see `ZooKeeper` in startup logs, you are still on a pre-migration compose file.

## 4. Verification commands

After the container reports `healthy`:

```bash
# 1. Confirm the broker is reachable on both listeners
docker exec crypto-trading-dev-kafka \
  kafka-broker-api-versions --bootstrap-server localhost:9092

docker exec crypto-trading-dev-kafka \
  kafka-broker-api-versions --bootstrap-server ${APP_HOSTNAME}:29092

# 2. Inspect the controller quorum (must show LeaderId=1, IsLeader=true)
docker exec crypto-trading-dev-kafka \
  kafka-metadata-quorum --bootstrap-server localhost:9092 describe --status

# 3. End-to-end producer/consumer smoke
docker exec crypto-trading-dev-kafka \
  kafka-topics --bootstrap-server kafka:9092 --create \
    --topic smoke-test --partitions 1 --replication-factor 1

docker exec crypto-trading-dev-kafka \
  kafka-console-producer --bootstrap-server kafka:9092 --topic smoke-test \
    < /dev/null

docker exec crypto-trading-dev-kafka \
  kafka-console-consumer --bootstrap-server kafka:9092 --topic smoke-test \
    --from-beginning --timeout-ms 5000

# 4. List the existing application topics (auto-created on first publish)
docker exec crypto-trading-dev-kafka \
  kafka-topics --bootstrap-server localhost:9092 --list
```

A green result for steps 1–3 confirms KRaft is healthy.

## 5. Recovery: stale `__cluster_metadata` log

If the broker refuses to start with errors mentioning `__cluster_metadata`, `Bad metadata log file`, or `Cluster ID mismatch`, the safest path is:

```bash
# Linux / macOS
./scripts/docker/cleanup-kafka-volumes.sh -y

# Windows
powershell -ExecutionPolicy Bypass -File scripts\docker\cleanup-kafka-volumes.ps1 -AutoConfirm

# Cross-platform wrapper
npm run docker:kafka:cleanup
```

The script backs up `be-cryptocurrency-trading-app_kafka_data` (which contains the `__cluster_metadata` partition) to a timestamped `kafka-volume-backup-*.tar.gz`, then removes the volume and brings Kafka back up. The named volume is auto-recreated by Docker.

> The backup is **mandatory** before deletion. The KRaft cluster ID is fixed, so a fresh volume re-initializes with the same `CLUSTER_ID` — no re-bootstrap is needed.

## 6. Rollback to ZooKeeper mode (emergency)

If KRaft proves unstable in production after deploy, the rollback is a code revert (single PR that brings back the `zookeeper` service, `KAFKA_ZOOKEEPER_CONNECT=zookeeper:2181`, and the ZK volumes). Data does not need to be migrated — `kafka-data` is shared between modes (consumer offsets, topic data, transaction log all use the same log-dir format).

Steps:

1. Revert the compose files for that environment to the previous commit.
2. `docker compose -f <infra-file> --profile kafka up -d` brings ZK + Kafka back online.
3. Do **not** keep KRaft volumes and ZK volumes side-by-side; remove the stale KRaft volumes after the rollback is verified (`docker volume rm be-cryptocurrency-trading-app_kafka_data`).

A live in-place rollback (KRaft → ZK without a restart) is **not supported** by Kafka.

## 7. Out of scope (deferred)

- Multi-broker combined or separated mode (RF ≥ 3) — would require `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=3`, `KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=3`, `MIN_ISR=2`, and a real quorum `KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka:9093,2@kafka2:9093,3@kafka3:9093`.
- Idempotent producer + `acks=all` in `kafka-outbox-event-publisher.service.ts` — see §9.
- JMX exporter + Prometheus scrape target — bitnami/jmx-exporter sidecar wired into all five compose files; see §10.
- SSL / SASL / mTLS for broker ↔ client.

## 8. References

- [KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum)
- [KIP-833: Deprecate ZooKeeper Mode in KRaft](https://cwiki.apache.org/confluence/display/KAFKA/KIP-833)
- [Confluent 7.6 KRaft setup guide](https://docs.confluent.io/platform/current/kafka-metadata-quorum.html)
- Internal: [`docs/KAFKA_LOCAL_DEV_LIFECYCLE.md`](KAFKA_LOCAL_DEV_LIFECYCLE.md) — historical context on the ZK-mode incidents that motivated this migration.

## 9. Idempotent producer + bounded DLQ retry

The NestJS outbox publisher (`kafka-outbox-event-publisher.service.ts`) is configured to deliver each event **exactly once per producer session** even when the broker or network drops the produce request and `kafkajs` retries it. The settings live in `.env.*`:

```env
KAFKA_PRODUCER_IDEMPOTENT=true      # enables kafkajs producer-id handshake
KAFKA_PRODUCER_MAX_IN_FLIGHT=1      # ≤5 (kafkajs caps at 5 when idempotent)
EVENT_OUTBOX_DLQ_MAX_RETRIES=3      # bounded DLQ auto-replay budget
EVENT_OUTBOX_DEAD_LETTER_RETRY_PER_FLUSH=5
```

### Producer-side guarantees

| Setting | Value | Why |
|---|---|---|
| `idempotent: true` | always (unless `KAFKA_PRODUCER_IDEMPOTENT=false` for emergency rollback) | Broker dedupes retries within a producer session via producer-id + sequence number |
| `maxInFlightRequests` | 1 (capped at 5 by `kafkajs` when idempotent) | Preserves per-partition ordering across retries |
| `acks` | `-1` (forced by `kafkajs` when `idempotent: true`) | All in-sync replicas acknowledge — strongest durability guarantee |

The publisher logs the resolved config on connect so the operator can verify the env vars actually took effect:

```
Kafka outbox publisher connected brokers=kafka:9092 idempotent=true maxInFlight=1 acks=-1
```

### Bounded DLQ retry

When the publisher fails N times in a row (N = `EVENT_OUTBOX_MAX_ATTEMPTS`, default 5), the row is **dead-lettered** (`dead_lettered_at` set, `publish_attempts` reset to 0). A subsequent flush can pick those rows up again, but only up to `EVENT_OUTBOX_DLQ_MAX_RETRIES` times — the counter lives on the row itself (`integration_outbox.dlq_retry_count`, default 0).

The atomic reset is a single SQL update:

```sql
UPDATE integration_outbox
   SET dead_lettered_at = NULL,
       next_retry_at = NULL,
       last_publish_error = NULL,
       publish_attempts = 0,
       dlq_retry_count = COALESCE(dlq_retry_count, 0) + 1
 WHERE id = :id
   AND published_at IS NULL
   AND dead_lettered_at IS NOT NULL
   AND COALESCE(dlq_retry_count, 0) < :max
```

The `WHERE` guards:
- **id**: only the row we picked
- **published_at IS NULL**: someone didn't already publish it
- **dead_lettered_at IS NOT NULL**: someone didn't already reset it
- **`dlq_retry_count < :max`**: the bounded-retry budget isn't exhausted

If the budget is exhausted the relay increments `outbox_relay_dlq_retry_skipped_total{event_type=…}` and the row stays in dead-letter state. The matching Prometheus alert (`OutboxDlqRetryBudgetExhausted`) pages on-call so the row can be inspected via `POST /admin/outbox/dead-lettered` and manually replayed via `POST /admin/outbox/{id}/replay` once the root cause is fixed.

This pattern guarantees:
1. **No silent data loss** — successful publishes are committed before the outbox row is marked `published_at` (transactional with the business write).
2. **No infinite loop on poisoned messages** — `EVENT_OUTBOX_DLQ_MAX_RETRIES` caps the auto-replay budget.
3. **No double-processing downstream** — `idempotent: true` on the producer side prevents the broker from accepting duplicate writes within a session.

### Migration

The `dlq_retry_count` column was added by migration `1800000001020-AddOutboxDlqRetryCounter.ts`. Run `npm run migration:run` after pulling. The migration is forward-only and idempotent (`ADD COLUMN ... DEFAULT 0`), so existing rows are filled with `0` automatically.

## 10. JMX exporter + Prometheus scrape

The Kafka broker exposes hundreds of JMX MBeans (controller quorum, request rates, JVM, log flush) but **only** through a local Java process — they are not reachable over HTTP. We attach a sidecar container (`bitnami/jmx-exporter`) that polls those MBeans and re-publishes them as Prometheus metrics.

### Sidecar layout

All five compose files contain the same `kafka-jmx-exporter` service:

```yaml
kafka-jmx-exporter:
  image: bitnami/jmx-exporter:latest
  environment:
    JMX_EXPORTER_CONFIG: /etc/jmx-exporter/kafka.yml
  volumes:
    - ./monitoring/kafka-jmx-exporter.yml:/etc/jmx-exporter/kafka.yml:ro
  command: ["<port>", "/etc/jmx-exporter/kafka.yml"]
  depends_on:
    kafka:
      condition: service_healthy
```

Two port-mapping choices:

| Env | Sidecar internal port | Host port (via `KAFKA_JMX_EXPORTER_PORT`) | Why |
|---|---|---|---|
| dev | 9191 | 9191 (default) | Port 9101 collides with Flutter Dart DevTools on Windows hosts |
| staging / prod | 9101 | 9101 (default) | No collision in headless environments |

### Pattern syntax (jmx_exporter 1.6.x)

The exporter canonicalizes each MBean ObjectName into:

```
domain<type=X, name=Y, ...><>Attribute : value
       ^ comma WITHOUT space ^     ^ empty <> before attribute ^
```

Common mistake: omitting the empty `<>` before the attribute, or using `<type=X>` without the comma. The bundled example `kafka-jmx-exporter.yml` includes a pattern-syntax cheat-sheet at the top so the next person doesn't relearn this.

The shipped config exposes **~600 metrics** spread across:

- **JVM**: heap memory, GC count / time per collector
- **Broker-level topic metrics** (cluster-wide, NOT per-topic — per-topic belongs in the backend exporter): `BytesInPerSec`, `BytesOutPerSec`, `MessagesInPerSec`, `FailedProduceRequestsPerSec`, etc.
- **Network request metrics**: per Kafka request type (Produce / Fetch / ApiVersions / BrokerHeartbeat / …), count + total time
- **Controller / KRaft**: `kafka_controller_active_count`, `kafka_server_raft_metrics_current_state{state="leader"}`
- **Catch-all** for any other `kafka.<type=X><>attr:` metric so new upstream counters are picked up automatically (with `_objectname` label to bound cardinality)

### Prometheus scrape

`prometheus/prometheus.yml` and `prometheus/prometheus.staging.yml` both contain:

```yaml
- job_name: 'kafka-jmx'
  static_configs:
    - targets: ['kafka-jmx-exporter:9101']
      labels:
        service: kafka-broker
  metrics_path: '/metrics'
  scrape_interval: 30s
  scrape_timeout: 10s
```

### Alerting rules

`prometheus/alerts.yml` has three Kafka-specific rules:

| Alert | Expression | Severity |
|---|---|---|
| `KafkaBrokerJmxDown` | `up{job="kafka-jmx"} == 0` for 2m | warning |
| `KafkaControllerInactive` | `kafka_controller_active_count == 0` for 2m | critical |
| `OutboxDlqRetryBudgetExhausted` | `increase(outbox_relay_dlq_retry_skipped_total[15m]) > 0` | warning |

The first two target broker availability; the third is for the bounded DLQ retry budget described in §9.

### Troubleshooting the exporter

If `curl http://localhost:<port>/metrics` returns only the `jmx_*` self-metrics and zero `kafka_*` lines, the cause is almost always one of:

1. **Pattern syntax** — confirm every `<type=X, name=Y>` uses comma WITHOUT space, and the attribute is preceded by `<>`, not by `<Attr>`.
2. **Kafka JMX not bound** — `KAFKA_JMX_PORT=9999` and `KAFKA_JMX_OPTS` must be set; verify with `docker logs <kafka> | grep JmxAgent`.
3. **Healthcheck probe collides with JMX** — the Kafka healthcheck runs `kafka-broker-api-versions`, which inherits `KAFKA_JMX_OPTS` and tries to bind its own JMX agent on 9999. The shipped healthcheck unsets those vars: `KAFKA_OPTS= KAFKA_JMX_OPTS= /usr/bin/kafka-broker-api-versions ...`.
4. **Exporter healthcheck uses `wget`** — the bitnami/jmx-exporter image has no `wget`/`curl`/`busybox`. The shipped healthcheck falls back to a pure bash `/dev/tcp` probe + an HTTP/1.0 GET + `grep '200 OK'`. Don't reintroduce `wget` here.

### Verification

```bash
# Quick smoke (dev)
curl -s http://localhost:9191/metrics | grep '^kafka_' | head

# KRaft-specific
curl -s http://localhost:9191/metrics | grep -E 'kafka_controller_active_count|kafka_server_raft_metrics_current_state'
# Expect:
#   kafka_controller_active_count 1.0
#   kafka_server_raft_metrics_current_state{state="leader"} 1.0
```


