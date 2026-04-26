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
