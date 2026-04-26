# Go Public WS / Ticker Rollout Runbook

## Mục tiêu

Giữ nguyên FE contract `/trading` (Socket.IO) trong quá trình chuyển dần nguồn ticker sang Go aggregator.

## Feature flags

- `TICKER_SOURCE=nestjs|go_aggregator`
- `PUBLIC_WS_SOURCE=nestjs|go`
- `GO_AGGREGATOR_TICKER_CHANNEL` (default `trading:external:ticker`)
- `GO_AGGREGATOR_OHLC_CHANNEL` (default `trading:external:ohlc`)

## Compatibility contract

Trong mọi chế độ rollout, payload phải giữ nguyên:

- `ticker` event: snake_case (`pair_id`, `last_price`, `volume_24h`, ...)
- `ohlc` event: snake_case (`open_time`, `close_time`, `quote_volume`, `trades_count`, ...)

## Canary checklist

1. Bật `TICKER_SOURCE=go_aggregator` ở staging.
2. Đảm bảo Go aggregator publish lên Redis channels:
   - `trading:external:ticker`
   - `trading:external:ohlc`
3. Kiểm tra endpoint parity:
   - `GET /api/v1/trading/admin/public-ws-parity`
4. Điều kiện pass:
   - `ticker.contractValid = true`
   - `ohlc.contractValid = true`
   - `goAggregatorParity.driftPairs = 0` (hoặc trong ngưỡng ops cho phép)
5. Nếu fail, rollback ngay:
   - set `TICKER_SOURCE=nestjs`

## Rollback

- Rollback cấp nguồn ticker: `TICKER_SOURCE=nestjs`
- Rollback cấp transport public WS: `PUBLIC_WS_SOURCE=nestjs`

## Ghi chú

- Private `/notifications` không đổi, vẫn do NestJS phục vụ.
- Endpoint parity dùng cho ops verification trước khi mở rộng canary.


## Readiness evidence

Trước khi mở rộng canary/rollout, lấy readiness report tổng hợp:

- `GET /api/v1/trading/admin/go-rollout-readiness`
- `POST /api/v1/trading/admin/go-rollout-readiness/snapshot`
- `GET /api/v1/trading/admin/go-rollout-readiness/snapshots?limit=20`
- `GET /api/v1/trading/admin/go-rollout-readiness/snapshots/latest`

Snapshot sẽ được lưu ở `reports/go-rollout/YYYY-MM-DD.json` để phục vụ audit acceptance.


## Runtime knobs (ops)

Các key nên cấu hình trước khi rollout/canary:

- `GO_AGGREGATOR_TICKER_CHANNEL`
- `GO_AGGREGATOR_OHLC_CHANNEL`
- `MATCHING_SHADOW_MONITOR_PAIRS`
- `MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT`
- `MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS`
- `GO_ROLLOUT_WINDOW_HOURS`
- `GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS`

## Outbox relay observability (Phase 4 hardening)

Theo dõi thêm tín hiệu tuổi backlog/DLQ để phát hiện relay bị nghẽn kéo dài:

- `GET /api/v1/admin/outbox/relay-health`
  - `oldestUnpublishedAt`, `oldestUnpublishedAgeSeconds`
  - `oldestDeadLetterAt`, `oldestDeadLetterAgeSeconds`
- Prometheus metrics:
  - `outbox_oldest_unpublished_age_seconds`
  - `outbox_oldest_dead_letter_age_seconds`

Gợi ý guardrail vận hành:

- Nếu `outbox_oldest_unpublished_age_seconds` tăng liên tục qua nhiều flush windows, kiểm tra relay throughput / consumer errors.
- Nếu `outbox_oldest_dead_letter_age_seconds` > 0 kéo dài, chạy triage và `requeue` sau khi xử lý root cause.


Threshold keys (runtime/system-config capable):
- EVENT_OUTBOX_ALERT_MAX_DEAD_LETTER_ROWS
- EVENT_OUTBOX_ALERT_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS
- EVENT_OUTBOX_ALERT_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS


Replay audit endpoints (outbox admin):
- `POST /api/v1/admin/outbox/dead-letter/:id/requeue` (body optional: `{ "reason": "..." }`)
- `POST /api/v1/admin/outbox/dead-letter/requeue` (body: `{ "limit": number, "reason"?: string }`)
- `GET /api/v1/admin/outbox/replay-audits?limit=20`

Mỗi action requeue sẽ ghi audit evidence vào `reports/outbox-replay/YYYY-MM-DD.json` gồm:
- actor (`actorUserId`, `actorRole`), thời điểm, reason
- target row hoặc batch size
- selected row count vs requeued row count
- snapshot metadata của dead-letter rows trước khi requeue

## Outbox degraded alert automation (warning/critical)

Runtime keys (env + system-config) cho automation:
- `EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED` (default `true`)
- `EVENT_OUTBOX_ALERTS_CHANNEL` (default `outbox:alerts`)
- Warning thresholds:
  - `EVENT_OUTBOX_ALERT_MAX_DEAD_LETTER_ROWS`
  - `EVENT_OUTBOX_ALERT_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS`
  - `EVENT_OUTBOX_ALERT_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS`
- Critical thresholds:
  - `EVENT_OUTBOX_ALERT_CRITICAL_MAX_DEAD_LETTER_ROWS`
  - `EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS`
  - `EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS`

Automation collector:
- Cron `EVERY_30_SECONDS`.
- Đọc `GET /api/v1/admin/outbox/relay-health` internal summary.
- Emit Redis pub/sub event khi severity đổi trạng thái:
  - event name: `outbox.relay.alert_state_changed`
  - severity: `none | warning | critical`
  - payload gồm reasons + health snapshot + thresholds snapshot.

Prometheus signal:
- `outbox_relay_alert_severity` (`0=none`, `1=warning`, `2=critical`)

### Runbook theo mức độ

#### Warning
1. Xác minh `EVENT_PUBLISHER_DRIVER` và Kafka broker reachability.
2. Kiểm tra `GET /api/v1/admin/outbox/relay-health`:
   - phân biệt backlog age tăng do throughput thấp hay dead-letter mới phát sinh.
3. Kiểm tra log relay lỗi gần nhất (`last_publish_error`, event_type, topic).
4. Nếu root cause đã xử lý, thực hiện requeue có lý do:
   - `POST /api/v1/admin/outbox/dead-letter/:id/requeue`
   - hoặc `POST /api/v1/admin/outbox/dead-letter/requeue`
5. Theo dõi recovery về `severity=none` trước khi đóng incident.

#### Critical
1. Mở incident ngay (P1/P2 tùy SLA), đóng băng rollout thay đổi Kafka path.
2. Kiểm tra nhanh:
   - Kafka cluster health, topic ACL, ISR/leader, producer auth.
   - Redis health (đảm bảo alert events vẫn phát được).
3. Nếu cần, tạm giảm blast-radius:
   - chuyển `EVENT_PUBLISHER_DRIVER=noop` ở môi trường bị sự cố để bảo toàn core transaction path (chỉ khi đã chấp thuận tradeoff event delivery).
4. Fix root cause, sau đó replay có kiểm soát theo batch nhỏ + reason audit.
5. Chỉ đóng incident khi:
   - `outbox_relay_alert_severity=0` ổn định qua nhiều chu kỳ,
   - không còn dead-letter tăng thêm,
   - replay audit thể hiện requeue hoàn tất và không tái-dead-letter bất thường.
