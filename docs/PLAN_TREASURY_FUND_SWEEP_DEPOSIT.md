# Plan: Cải thiện Treasury Fund/Sweep & Deposit TRON

**Ngày:** 2026-04-21  
**Phạm vi:** `treasury/`, `blockchain/deposit-watcher/`, `blockchain/application/use-cases/deposits/`  
**Ưu tiên:** Cao — ảnh hưởng trực tiếp đến vận hành và trải nghiệm trader

---

## 1. Chẩn đoán vấn đề hiện tại

### 1.1 Fund/Sweep bị treo (hanging)

#### Luồng hiện tại

```
enqueueFund/enqueueSweep
  → Bull job (100 attempts, backoff exponential)
    → processFundJob / processSweepJob
      → tryAcquireWalletLock (Redis SET NX EX 120)
        ├─ Acquired → markProcessing → broadcast tx → releaseWalletLock → waitForBalance (60–90s)
        └─ Not acquired → startOrGetLockWaitTimer → throw TreasuryWalletBusyException
              → Bull retry với exponential backoff (max 20s/lần)
              → Sau 15 phút → TREASURY_WALLET_BUSY_TIMEOUT → FAILED
```

#### Nguyên nhân gốc rễ của treo vĩnh viễn

| # | Vấn đề | Cơ chế | Hậu quả |
|---|--------|--------|---------|
| 1 | **Lock TTL quá ngắn** (120s) nhưng `waitForBalance` tốn 60–90s | Nếu broadcast tx xong nhưng `waitForBalance` chưa kết thúc thì lock đã expire; job khác acquire lock, song song chạy trên cùng ví | Double broadcast, nonce conflict, ví bị stuck |
| 2 | **`processFundJob` / `processSweepJob` giữ lock trong toàn bộ thời gian** bao gồm cả `waitForBalance` | Lock được release sau broadcast (`lockHeld = false`) nhưng `waitForBalance` vẫn tiêu tốn worker thread 60–90s | Worker bị block, queue không tiến |
| 3 | **100 retries × exponential backoff** cộng dồn thời gian retry rất lớn | Nhiều jobs cùng chờ 1 ví → N×20s delay per step, nhiều jobs queue tạo ra "bầy sói" (thundering herd) | Queue phình to, jobs treo vĩnh viễn |
| 4 | **`runWithEnqueueLock` (30s, spin 2s)** không đủ bảo vệ nhiều FUND song song cho cùng ví | Mỗi FUND tạo `jobId` unique (có `uuidv7()`) → không phát hiện duplicate → N jobs trên cùng ví | N Fund jobs cạnh tranh lock ví → toàn bộ treo |
| 5 | **`waitForTronUsdtBalanceReflectFund` polling trực tiếp RPC** không có circuit breaker | Nếu TronGrid chậm/timeout → polling block worker 90s → job timeout → retry lại từ đầu | Retry loop vô tận |
| 6 | **`manualRetryTreasuryOperation` chỉ release lock không reset `lockWaitTimer`** | Timer từ attempt cũ vẫn tính, nếu timer gần expire → ngay sau manual retry lại FAILED | Manual retry không có tác dụng |
| 7 | **Bull Processor không có `concurrency` giới hạn explicit** | Mặc định Bull chạy song song nhiều jobs → nhiều `processFundJob` cùng lúc trên các ví khác nhau nhưng tranh nhau Redis | Tăng áp lực Redis và RPC |

#### Ví dụ scenario treo vĩnh viễn thực tế

```
T+0s:   FUND-A enqueue cho ví-1 (job-1)
T+1s:   FUND-B enqueue cho ví-1 (job-2)  ← cùng ví, khác jobId (uuidv7)
T+0s:   job-1 acquire lock ví-1 (EX 120)
T+0s:   job-2 không acquire được → throw WALLET_BUSY → Bull retry sau 3s
T+5s:   job-1 broadcast tx ví-1 → release lock → bắt đầu waitForBalance (60s)
T+5s:   job-2 retry → acquire lock ví-1 (lock đã release)
T+5s:   job-2 broadcast tx ví-1 → NONCE CONFLICT hoặc insufficient balance
T+5s:   job-2 markFailed("nonce") → FAILED
T+65s:  job-1 waitForBalance timeout (balance không tăng vì NONCE conflict)
T+65s:  job-1 throw TREASURY_FUND_USDT_BALANCE_NOT_UPDATED → FAILED
```

---

### 1.2 Deposit TRON — item lịch sử không hiển thị

#### Luồng hiện tại

```
TronGrid API poll (5s)
  → DepositIngestionService.ingestTxHash()
    → walletLinkingService.findVerifiedWalletByChainAndAddress(sender)
      ├─ Không tìm thấy → SKIP SILENTLY → không tạo history item
      └─ Tìm thấy → ingestIncomingDepositForUser()
          → onchain_transactions INSERT
          → integration_outbox INSERT (OnchainDepositSubmittedV1)
            → OutboxRelay (async, periodic) → read_onchain_deposits UPSERT
              → notifications INSERT
```

#### Các gap khiến item không xuất hiện

| # | Gap | Hậu quả |
|---|-----|---------|
| 1 | **Trader nạp từ ví chưa link** | Không tìm được `user_id` → skip → không có history item, không credit |
| 2 | **Outbox relay lag/failure** | `onchain_transactions` đã có nhưng `read_onchain_deposits` chưa sync → UI không thấy |
| 3 | **`READ_MODEL_ONCHAIN_DEPOSITS=false`** | Query fallback sang `onchain_transactions` nhưng merge logic có thể miss rows |
| 4 | **Chỉ tạo history item sau khi settle** | Nếu settlement fail (FX rate missing, ledger error) → outbox không emit `Settled` → item stuck ở CONFIRMING mãi |
| 5 | **Không có manual ingest endpoint** | Admin không thể force-ingest 1 tx hash cụ thể khi auto scanner bỏ sót |

---

## 2. Giải pháp phần mềm

### 2.1 Fund/Sweep: Serialization per wallet thay vì lock contention

#### Nguyên tắc thiết kế mới

> **Một ví → một worker → một job tại một thời điểm**  
> Không dùng Redis lock để serialize → dùng Bull queue per-wallet hoặc concurrency=1 per wallet key

#### Phương án A — Concurrency=1 + Named Job Group per Wallet (Khuyến nghị)

```
enqueueFund(walletId) → Bull job với jobId = "treasury:{type}:{walletId}:SINGLE"
```

- **`jobId` cố định per ví per type**: thay vì `uuidv7()` làm suffix, dùng deterministic ID
  - FUND: `treasury-fund:{walletId}:{asset}` (không có UUID)  
  - SWEEP: `treasury-sweep:{walletId}:{asset}:{mainWalletId}`
- **Kiểm tra job tồn tại trước khi add**: nếu job đã tồn tại (waiting/active) → trả về `alreadyQueued: true`
- **Bull tự serialize**: vì `jobId` giống nhau, Bull sẽ không add duplicate (throw `JobExistsError` hoặc return existing)
- **Loại bỏ per-wallet Redis lock**: không còn `tryAcquireWalletLock` — Bull job queue là serializer duy nhất
- **Tách `waitForBalance` ra khỏi job chính**: sau khi broadcast tx, emit event `TreasuryTxBroadcast` → separate "confirmation poller" job

#### Luồng mới

```
enqueueFund(walletId, asset, amount)
  → jobId = "treasury-fund:{walletId}:{asset}"     ← deterministic, không UUID
  → treasuryQueue.add(FUND_JOB, data, { jobId, removeOnComplete: false })
    ├─ Nếu job đã tồn tại → return { alreadyQueued: true, operationId: existing.data.operationId }
    └─ Job mới → create operation PENDING → add to queue

processFundJob(job)
  → operation = getOperationForProcessing(data.operationId)
  → broadcast tx (không cần lock vì queue serialize)
  → update operation: status=PROCESSING, tx_hash=txHash
  → remove job từ queue
  → enqueue TREASURY_CONFIRM_JOB (polling job riêng, không block queue)
  → return (job done)

processTreasuryConfirmJob(job)
  → poll balance / check tx status trên chain (timeout 5 phút)
  → nếu confirmed → finalizeSuccess → COMPLETED
  → nếu timeout → markFailed / operator retry
```

#### Phương án B — Concurrency=1 per queue + Single FIFO per wallet (Đơn giản hơn)

- Tạo **N sub-queues** (một per ví active) hoặc dùng **priority queue** với wallet partition key
- Phức tạp hơn về infra, không khuyến nghị

---

### 2.2 Loại bỏ lock TTL race condition

**Vấn đề cụ thể:** Lock TTL 120s < broadcast (biến thiên) + waitForBalance (60–90s)

**Fix ngắn hạn** (trong khi chờ refactor lớn):
- Tăng lock TTL lên 300s
- `waitForBalance` chạy **sau khi** release lock (đã làm rồi trong code với `lockHeld = false`)  
  → Kiểm tra lại: `releaseWalletLock` được gọi trước `waitForBalance` → OK
- **Vẫn còn vấn đề**: nếu broadcast bị block >120s (RPC slow) → lock expire giữa chừng

**Fix dài hạn**: Dùng lock refresh (heartbeat) hoặc bỏ hẳn lock (Phương án A).

---

### 2.3 Thundering herd — giới hạn retry và queue depth

```typescript
// Thay vì 100 attempts:
attempts: 10,
backoff: { type: 'treasuryDefer', delay: 5_000 },

// Giới hạn số job PENDING trên 1 ví:
const pendingCount = await this.treasuryQueue.getJobCountByTypes('waiting', 'active', 'delayed');
if (pendingCount > MAX_PENDING_PER_WALLET) throw new ServiceUnavailableException(...)
```

---

### 2.4 Deposit TRON — tạo history item ngay khi phát hiện tx

#### Nguyên tắc

> **History item phải xuất hiện ngay khi tx được phát hiện on-chain, bất kể user có link ví hay không**

#### Thay đổi luồng ingest

```
ingestTxHash(chain, txHash)
  → resolveDepositTransfers()
  → Cho mỗi leg phù hợp (to = deposit address):
      → lookupLinkedUser(leg.from)
        ├─ Tìm thấy user → ingestIncomingDepositForUser() (giữ nguyên logic)
        └─ Không tìm thấy → createUnmatchedDepositRecord()
            → INSERT vào onchain_transactions với user_id=NULL, status=UNMATCHED
            → INSERT vào integration_outbox (UnmatchedDepositDetectedV1)
            → Admin notification/alert
```

**Bảng trạng thái mới cho `onchain_transactions.status`:**

| Status | Ý nghĩa |
|--------|---------|
| `UNMATCHED` | Tx đến đúng địa chỉ nhưng không link được user |
| `CONFIRMING` | Đã link user, chờ confirmations |
| `COMPLETED` | Confirmed + settled |
| `FAILED` | Tx fail on-chain |

#### API cho admin: Manual ingest

```
POST /blockchain/admin/deposits/ingest
Body: { chain, txHash, logIndex? }
→ Force ingest một tx hash cụ thể
→ Ghi đè logic auto-detect, resolve legs, match user
→ Trả về operationId và status
```

#### API cho admin: Match unmatched deposit

```
POST /blockchain/admin/deposits/{txId}/match-user  
Body: { userId }
→ Tìm UNMATCHED record
→ Associate với userId
→ Trigger settlement nếu tx đã confirmed
→ Emit OnchainDepositSettledV1 outbox event
```

---

### 2.5 Deposit TRON — đảm bảo history item hiển thị ngay lập tức

**Vấn đề:** Read model sync chạy async qua Outbox → có thể lag

**Fix:** Khi query lịch sử deposit, merge từ **cả hai nguồn**:

```sql
-- Priority: read_onchain_deposits (đã sync) UNION onchain_transactions (chưa sync)
SELECT * FROM read_onchain_deposits WHERE user_id = $1
UNION ALL
SELECT * FROM onchain_transactions 
WHERE user_id = $1 
  AND type IN ('DEPOSIT')
  AND tx_id NOT IN (SELECT tx_id FROM read_onchain_deposits WHERE user_id = $1)
ORDER BY created_at DESC
```

→ Đã có logic này (file `read-onchain-user-transactions.query.service.ts`) nhưng cần verify flag `READ_MODEL_ONCHAIN_DEPOSITS` và đảm bảo fallback đúng.

---

## 3. Giải pháp vận hành

### 3.1 Dashboard giám sát Treasury

**Metrics cần có** (expose qua `/admin/treasury/metrics` hoặc Prometheus):

| Metric | Cách tính |
|--------|-----------|
| `treasury_queue_depth` | Bull queue waiting + delayed |
| `treasury_operations_by_status` | COUNT grouped by status |
| `treasury_lock_wait_p95` | từ `treasury:lock-wait-since:*` keys |
| `treasury_stuck_operations` | PROCESSING > 10 phút |
| `treasury_failed_last_1h` | COUNT FAILED trong 60 phút |
| `deposit_unmatched_count` | COUNT UNMATCHED trong onchain_transactions |
| `deposit_outbox_lag` | MAX(now - created_at) WHERE published_at IS NULL |

### 3.2 Alert rules

```yaml
# Ví dụ Prometheus alert rules
- alert: TreasuryOperationStuck
  expr: treasury_stuck_operations > 0
  for: 10m
  labels:
    severity: warning

- alert: TreasuryQueueDepthHigh  
  expr: treasury_queue_depth > 20
  for: 5m
  labels:
    severity: critical

- alert: DepositOutboxLagging
  expr: deposit_outbox_lag_seconds > 60
  for: 2m
  labels:
    severity: warning

- alert: UnmatchedDepositAccumulating
  expr: deposit_unmatched_count > 0
  labels:
    severity: info
```

### 3.3 Runbook: Fund/Sweep bị treo

```
1. Kiểm tra: GET /treasury/operations?status=PROCESSING
2. Nếu operation > 10 phút status=PROCESSING:
   a. POST /treasury/operations/{id}/manual-abort  ← nếu tx chưa broadcast
   b. Kiểm tra tx hash on TronScan, nếu tx thành công:
      POST /treasury/operations/{id}/manual-settle { txHash, amount }
   c. Nếu tx fail on-chain:
      POST /treasury/operations/{id}/manual-retry
3. Kiểm tra Redis lock: redis-cli GET treasury:lock:{walletId}
   Nếu lock bị stale: redis-cli DEL treasury:lock:{walletId}
4. Monitor lại sau 5 phút
```

### 3.4 Runbook: Deposit TRON không hiển thị

```
1. Trader cung cấp: tx hash + số tiền
2. Kiểm tra TronScan: tx đã confirmed?
3. Kiểm tra DB: SELECT * FROM onchain_transactions WHERE tx_hash = '{hash}'
   a. Có row → kiểm tra status, nếu CONFIRMING → trigger settle:
      POST /blockchain/admin/deposits/{txId}/settle
   b. Không có row → kiểm tra linked wallet:
      SELECT * FROM linked_wallet WHERE address = '{sender_address}'
      - Nếu không có: POST /blockchain/admin/deposits/ingest { chain, txHash }
        → Sau đó POST /blockchain/admin/deposits/{txId}/match-user { userId }
      - Nếu có: Outbox lag → kiểm tra integration_outbox
4. Kiểm tra read model: SELECT * FROM read_onchain_deposits WHERE tx_hash = '{hash}'
5. Nếu read model missing: xem integration_outbox có published_at IS NULL không
   → Force outbox flush hoặc manual UPSERT vào read_onchain_deposits
```

---

## 4. Kế hoạch triển khai

### Phase 1 — Fix ngắn hạn, không breaking (1–2 ngày)

**Mục tiêu:** Giảm ngay xác suất treo, không refactor lớn

| Task | File | Thay đổi |
|------|------|---------|
| 1.1 Tăng lock TTL 120s → 300s | `treasury-operations.service.ts:941` | `EX, 300` |
| 1.2 Giảm attempts 100 → 15 | `treasury-operations.service.ts` | `attempts: 15` |
| 1.3 Fix `buildFundJobId` — bỏ `uuidv7()` để detect duplicate | `treasury-operations.service.ts:955` | Xem §4.1 |
| 1.4 Reset `lockWaitTimer` trong `manualRetryTreasuryOperation` | `treasury-operations.service.ts:488` | Gọi `clearLockWaitTimer(operationId)` |
| 1.5 Add Bull concurrency limit (1 per processor) | `treasury.module.ts` hoặc processor | `@Process({name, concurrency: 1})` |
| 1.6 Manual ingest admin endpoint | `blockchain.controller.ts` | POST endpoint mới |
| 1.7 Verify `READ_MODEL_ONCHAIN_DEPOSITS` fallback | query service | Integration test |

**§4.1 Fix `buildFundJobId`:**
```typescript
// TRƯỚC (tạo duplicate jobs):
private buildFundJobId(walletId: string, asset: string): string {
  return `treasury-fund:${walletId}:${asset}:${uuidv7()}`;
}

// SAU (serialize per wallet):
private buildFundJobId(walletId: string, asset: string): string {
  return `treasury-fund:${walletId}:${asset}`;
}
// → Cần handle JobExistsError từ Bull và trả về alreadyQueued: true
// → Hoặc check existing job trước khi add (đã có resolveExistingTreasuryJob)
```

**Lưu ý:** Khi `jobId` deterministic, nhiều FUND cùng lúc sẽ serialize tự nhiên. Cần đảm bảo logic sau khi job complete, jobId được giải phóng để job tiếp theo có thể add.

---

### Phase 2 — Refactor luồng Fund/Sweep (3–5 ngày)

**Mục tiêu:** Loại bỏ lock hoàn toàn, dùng queue làm serializer

| Task | Mô tả |
|------|-------|
| 2.1 Tách `waitForBalance` thành `TREASURY_CONFIRM_JOB` | Job riêng, không block main processor |
| 2.2 Bỏ `tryAcquireWalletLock` / `releaseWalletLock` | Queue serialize thay thế |
| 2.3 Thêm trạng thái `TX_BROADCAST` cho operation | Biết tx đã broadcast chưa settled |
| 2.4 Implement `processTreasuryConfirmJob` | Retry-able, timeout riêng |
| 2.5 Migration: thêm column `status TX_BROADCAST` | DB migration |
| 2.6 Unit tests cho các scenario treo | `treasury-operations.service.spec.ts` |

**Sơ đồ trạng thái mới:**
```
PENDING → PROCESSING → TX_BROADCAST → COMPLETED
                    ↘              ↘
                     FAILED         FAILED (confirm timeout)
```

---

### Phase 3 — Deposit history & monitoring (2–3 ngày)

| Task | Mô tả |
|------|-------|
| 3.1 Thêm status `UNMATCHED` vào onchain_transactions | Migration + entity |
| 3.2 Implement `createUnmatchedDepositRecord` | Service method |
| 3.3 Admin endpoint: manual ingest | Controller + service |
| 3.4 Admin endpoint: match-user | Controller + service |
| 3.5 Admin endpoint: force settle | Controller + service |
| 3.6 Treasury metrics endpoint | Controller |
| 3.7 Alert rules (Prometheus/Grafana hoặc custom) | Infra config |
| 3.8 Runbook documentation | `.claude/runbooks/` |

---

## 5. Rủi ro và mitigations

| Rủi ro | Mức độ | Mitigation |
|--------|--------|------------|
| Fix `buildFundJobId` khiến nhiều FUND không được queued | Cao | Test kỹ; implement proper "queue after complete" flow |
| Tách `waitForBalance` → có thể miss completion event | Trung bình | Confirm job cũng retry, fallback manual settle |
| Admin endpoint match-user credit nhầm user | Cao | Require 2FA / approval từ RISK_OFFICER; audit log bắt buộc |
| Migration `UNMATCHED` status break backward compat | Thấp | Migration additive, không xóa enum cũ |
| Outbox relay chậm → phase 3 items delay | Thấp | Merge query (§2.5) đã cover |

---

## 6. Thứ tự ưu tiên tuyệt đối

```
[NGAY BÂY]  Phase 1.3 — Fix buildFundJobId (bỏ uuidv7, dùng deterministic)
[NGAY BÂY]  Phase 1.4 — Reset lockWaitTimer trong manualRetry
[NGAY BÂY]  Phase 1.6 — Manual ingest admin endpoint (unblock ops)

[TUẦN NÀY]  Phase 1.1, 1.2, 1.5 — Tune TTL/attempts/concurrency
[TUẦN NÀY]  Phase 1.7 — Verify deposit query fallback

[SPRINT NÀY] Phase 2 — Refactor queue-as-serializer
[SPRINT SAU] Phase 3 — UNMATCHED status + admin tools + monitoring
```

---

## 7. Files cần thay đổi (tổng hợp)

| File | Phase | Loại thay đổi |
|------|-------|--------------|
| `treasury/treasury-operations.service.ts` | 1, 2 | Fix jobId, TTL, attempts, remove lock |
| `treasury/treasury.processor.ts` | 2 | Add confirm processor |
| `treasury/treasury.module.ts` | 1, 2 | Concurrency config |
| `treasury/treasury-queue-backoff.ts` | 1 | Tune delays |
| `blockchain/blockchain.controller.ts` | 1, 3 | Admin endpoints |
| `blockchain/application/use-cases/deposits/onchain-deposit.service.ts` | 3 | UNMATCHED logic |
| `blockchain/deposit-watcher/deposit-ingestion.service.ts` | 3 | createUnmatched flow |
| `entities/onchain-transaction.entity.ts` | 3 | UNMATCHED status enum |
| DB migrations | 2, 3 | TX_BROADCAST, UNMATCHED columns |
| `read-onchain-user-transactions.query.service.ts` | 1 | Verify UNION fallback |

---

*Plan này tập trung vào correctness trước performance. Sau khi luồng stable, mới optimize throughput (parallel FUND cho các ví khác nhau, etc.).*
