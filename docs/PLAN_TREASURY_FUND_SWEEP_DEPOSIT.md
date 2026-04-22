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
T+0s:    FUND-A enqueue cho ví-1 (job-1)
T+1s:    FUND-B enqueue cho ví-1 (job-2)  ← cùng ví, khác jobId (uuidv7)
T+1s:    job-1 acquire lock ví-1 (EX 120)
T+1s:    job-2 không acquire → throw WALLET_BUSY → treasuryDeferBackoff (3s → 6s → …)
T+5s:    job-1 broadcast tx ví-1 → release lock → bắt đầu waitForBalance (60s)
T+5s:    job-2 retry (deferred) → acquire lock ví-1 (lock đã release)
T+5s:    job-2 broadcast tx ví-1 lần 2 → TRON trả về DUP_TRANSACTION_ERROR
         hoặc insufficient balance (vì tx-1 đã consume) → markFailed("broadcast")
T+65s:   job-1 waitForBalance timeout (balance không phản ánh vì job-2 cũng tác động) → FAILED
T+65s+:  Timer lockWait 15min cũ vẫn tồn tại → manual retry bị reject
```

> **Chú ý chuẩn TRON:** TRON không dùng account nonce như EVM — thay bằng `ref_block_bytes` + `expiration`. Double broadcast cho cùng contract call thường gặp `DUP_TRANSACTION_ERROR` hoặc `CONTRACT_VALIDATE_ERROR` (insufficient balance), không phải "nonce conflict". Nếu mở rộng sang EVM thì scenario nonce mới đúng.

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

#### Phương án A — Deterministic jobId + `removeOnComplete: true` (Khuyến nghị)

> **Cảnh báo về Bull behavior:** `bull` (legacy) và `bullmq` **không throw `JobExistsError`** khi add job với jobId đã tồn tại — nó **silently return existing job**. Nếu dùng `removeOnComplete: false`, job `completed` cũ giữ nguyên ID → lần enqueue kế tiếp cho cùng ví sẽ **không tạo job mới** → FUND thứ hai **không bao giờ chạy**. Vì vậy deterministic jobId **phải** đi kèm `removeOnComplete: true` + `removeOnFail: true` (hoặc cơ chế dọn job completed/failed trước khi add).

- **`jobId` cố định per ví per type** (thay vì `uuidv7()`):
  - FUND: `treasury-fund:{walletId}:{asset}`
  - SWEEP: `treasury-sweep:{walletId}:{asset}:{mainWalletId}` (hiện đã deterministic)
- **Dedupe chủ động**:
  1. Call `resolveExistingTreasuryJob(jobId)` — nếu tồn tại ở `waiting/active/delayed` → return `alreadyQueued: true`.
  2. Nếu tồn tại ở `completed/failed` → `job.remove()` trước khi `queue.add` (tránh silent-reject).
  3. Bọc cả 2 bước trong **Postgres advisory lock** `pg_try_advisory_xact_lock(hashtext(walletId))` thay vì Redis enqueue-lock — atomic theo DB transaction, không lo Redis partition.
- **Tách `waitForBalance` ra khỏi job chính** (§2.1 bản gốc đúng): sau broadcast, enqueue `TREASURY_CONFIRM_JOB` riêng. Main job hoàn tất nhanh → worker không bị block 60s.
- **Serialization per-wallet dùng BullMQ group limiter** thay vì `concurrency: 1` global:
  ```typescript
  // BullMQ (nếu upgrade): limiter group key theo walletId
  new Worker(queueName, processor, {
    limiter: { max: 1, duration: 1_000, groupKey: 'walletId' },
  });
  ```
  Hoặc fallback với Bull legacy: **partition queues** — mỗi ví 1 sub-queue tên `treasury-wallet-{walletId}` với concurrency=1.
- **Không bỏ hẳn Redis lock per-wallet** — giữ như "defensive layer" phát hiện double-broadcast do bug logic; nhưng không dùng như primary serializer.

#### Luồng mới

```
enqueueFund(walletId, asset, amount)
  → BEGIN; SELECT pg_try_advisory_xact_lock(hashtext(walletId)); ← atomic dedupe
  → jobId = "treasury-fund:{walletId}:{asset}"     ← deterministic, không UUID
  → existing = resolveExistingTreasuryJob(jobId)
      ├─ active/waiting/delayed → return { alreadyQueued: true }
      ├─ completed/failed       → existing.remove(); fallthrough
      └─ none                   → fallthrough
  → INSERT treasury_operation (status=PENDING, idempotency_key=hash(operationId))
  → treasuryQueue.add(FUND_JOB, data, {
      jobId,
      attempts: 10,
      backoff: { type: 'treasuryDefer', delay: 5_000 },
      removeOnComplete: true,    ← BẮT BUỘC để tránh silent-reject
      removeOnFail: true,        ← để cleanup terminal jobs
      timeout: 60_000,           ← guard against infinite hang
    })
  → COMMIT;

processFundJob(job)
  → operation = getOperationForProcessing(data.operationId)  ← idempotent re-entry
  → IF operation.status == 'TX_BROADCAST' → goto enqueueConfirmJob (reuse tx_hash)
  → IF operation.broadcast_idempotency_key đã set → đã broadcast trước → reuse
  → tạo broadcast_idempotency_key = sha256(operationId|nonce/refBlock)
  → UPDATE operation: status=TX_BROADCAST, broadcast_idempotency_key=<key>  ← BEFORE RPC
  → broadcast tx
  → UPDATE operation: tx_hash=<hash>
  → enqueue TREASURY_CONFIRM_JOB { operationId, txHash }
  → return  ← worker không block, queue tiến tiếp

processTreasuryConfirmJob(job)
  → poll tx receipt + balance trên chain (timeout 5 phút, exponential backoff)
  → confirmed → finalizeSuccess → COMPLETED
  → timeout    → markFailed (operator runbook §3.3)
  → tx_failed  → markFailed
```

#### Phương án B — Per-wallet Sub-queue (Đơn giản, dùng được với Bull legacy)

- Tạo **N sub-queues** dynamic theo ví: `treasury-wallet-{walletId}` với `concurrency: 1`.
- Quản lý lifecycle: tạo lazy khi enqueue lần đầu, GC sau 24h idle.
- **Ưu điểm vs Phương án A:** không phụ thuộc upgrade BullMQ; serialize đúng per-wallet.
- **Nhược điểm:** số queue tăng tuyến tính theo số ví active, monitor Bull Board phức tạp.

> **Khuyến nghị thực tế:** Phase 2 dùng **Phương án A + Postgres advisory lock**. Nếu sau 1 sprint vẫn flaky, fallback Phương án B.

---

### 2.2 Loại bỏ lock TTL race condition

**Vấn đề cụ thể:** Lock TTL 120s < broadcast (biến thiên do RPC) + `waitForBalance` (60–90s)

**Fix ngắn hạn** (trong khi chờ refactor Phase 2):
- Tăng lock TTL lên **300s** (đủ buffer cho cả broadcast + wait).
- Verify thứ tự: code hiện tại release lock **trước** `waitForBalance` (`lockHeld = false` tại line ~292/403) → race vẫn tồn tại nếu 2 job chạy concurrent sau khi job-1 release lock nhưng balance chưa reflect.
- **Broadcast idempotency key (BẮT BUỘC):** lưu `broadcast_idempotency_key` vào `treasury_operation` **trước khi** call RPC broadcast. Nếu worker crash giữa chừng, retry đọc key và **không broadcast lại**. Key = `sha256(operationId || refBlockBytes || expiration)`.
- **Lock heartbeat thay vì TTL dài cứng:** spawn setInterval mỗi 30s gọi Lua `EXPIRE` extend lock 60s trong lúc processing. Dừng heartbeat khi release. Giới hạn tổng thời gian heartbeat 10 phút để tránh lock vĩnh viễn.

**Fix dài hạn (Phase 2):** Loại lock khỏi critical path, chỉ giữ như "defensive detector" (log warning nếu 2 job cùng ví acquire concurrent).

---

### 2.3 Thundering herd — giới hạn retry và queue depth

```typescript
// Thay vì 100 attempts × exponential backoff (có thể lên tới vài giờ):
attempts: 10,
backoff: { type: 'treasuryDefer', delay: 5_000 }, // cap 20s/step (giữ nguyên)
timeout: 60_000, // Bull timeout per attempt — kill worker nếu treo

// Giới hạn số job PENDING trên 1 ví (kiểm tra trong enqueueFund/Sweep):
const active = await resolveExistingTreasuryJob(jobId);
if (active) return active; // đã có job → return alreadyQueued
// KHÔNG dùng getJobCountByTypes toàn queue — nó đếm mọi ví và cost O(n).
// Dùng check theo jobId deterministic là đủ (atomic + cheap).
```

**Concurrency:** không dùng `@Process({concurrency: 1})` vì sẽ global-serialize mọi ví. Dùng **per-wallet partition** (Phương án A hoặc B §2.1). Nếu tạm thời chưa refactor, đặt `concurrency = min(numWallets, 4)` để tránh oversubscribe Redis/RPC.

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

#### API cho admin: Match unmatched deposit (dual approval BẮT BUỘC)

```
POST /blockchain/admin/deposits/{txId}/match-user
Body: { userId, approverRole: 'RISK_OFFICER' | 'FINANCE_ADMIN' }
Headers: Idempotency-Key: sha256(txId|userId)
→ Bước 1 (RISK_OFFICER đề nghị): tạo match_request PENDING
→ Bước 2 (FINANCE_ADMIN duyệt): verify txId + userId không đổi + PENDING
   → Associate UNMATCHED record với userId
   → Trigger settlement nếu tx đã confirmed
   → Emit OnchainDepositSettledV1 outbox event
→ Audit log: immutable entry (actor, timestamp, txId, userId, before/after)
→ Anti-abuse: rate limit 5 match/ngày/admin; reject nếu txId đã match rồi
```

> **Lý do dual approval:** Credit user sai tiền on-chain không thể rollback. Single-admin match có thể bị social-engineer hoặc insider threat. Chuẩn: tách "propose" và "approve" sang 2 role, hai người khác nhau.

---

### 2.5 Deposit TRON — đảm bảo history item hiển thị ngay lập tức

**Vấn đề:** Read model sync chạy async qua Outbox → có thể lag

**Fix:** Khi query lịch sử deposit, merge từ **cả hai nguồn** bằng `LEFT JOIN … IS NULL` (tránh `NOT IN` subquery vì không hiệu quả trên `tx_id` lớn và trả NULL sai khi có NULL row):

```sql
-- Priority: read_onchain_deposits (đã sync) UNION onchain_transactions (chưa sync)
SELECT r.tx_id, r.user_id, r.amount, r.status, r.created_at
  FROM read_onchain_deposits r
  WHERE r.user_id = $1
UNION ALL
SELECT o.tx_id, o.user_id, o.amount, o.status, o.created_at
  FROM onchain_transactions o
  LEFT JOIN read_onchain_deposits r
    ON r.tx_id = o.tx_id AND r.user_id = o.user_id
  WHERE o.user_id = $1
    AND o.type = 'DEPOSIT'
    AND r.tx_id IS NULL
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

**Indexes cần có** (nếu chưa):
- `idx_read_onchain_deposits_user_created (user_id, created_at DESC)`
- `idx_onchain_transactions_user_type_created (user_id, type, created_at DESC)`
- `idx_onchain_transactions_tx_id (tx_id)` cho LEFT JOIN

### 2.6 Chain reorg & confirmations (mới)

TRON hiện tại rất ít reorg nhưng vẫn phải có policy để tránh "phantom deposit":

- **Confirmations threshold:** 19 blocks cho TRON (~1 phút) trước khi chuyển `CONFIRMING → COMPLETED` và credit wallet. Cấu hình env `TRON_CONFIRMATIONS=19`.
- **Reorg handling:** `DepositConfirmationJob` phải re-check tx còn trong canonical chain trước finalize. Nếu tx disappear → `status=REORGED`, không credit, alert ops.
- **EVM khi mở rộng:** 12 blocks (ETH mainnet), 30 blocks (BSC), documented per-chain.

### 2.7 Logging & PII (mới)

- Log structured hiện có `userId + amount` — **không** log địa chỉ ví đầy đủ (mask 6 ký tự đầu + 4 ký tự cuối).
- `txHash` có thể log full (public on-chain data).
- Retention log: 90 ngày cho structured logs có PII, 1 năm cho anonymized metrics.
- Áp dụng cho `deposit.ingest.success`, `treasury.fund/sweep.*` log lines.

---

## 3. Giải pháp vận hành

### 3.1 Dashboard giám sát Treasury

**Metrics cần có** (expose qua `/admin/treasury/metrics` theo format Prometheus; emit tại event-time, **không** dùng `SCAN` Redis key-space trên prod vì O(n) và block):

| Metric | Loại | Nguồn / cách tính |
|--------|------|-----------|
| `treasury_queue_depth{type}` | Gauge | `queue.getJobCounts()` mỗi 15s (không SCAN keys) |
| `treasury_operations_total{status}` | Counter | tăng khi transition DB status |
| `treasury_lock_wait_seconds` | Histogram | observe khi release lock (start timestamp trong memory/DB row) |
| `treasury_stuck_operations` | Gauge | `COUNT(*) WHERE status='PROCESSING' AND updated_at < now()-interval '10 min'` |
| `treasury_failed_total{reason}` | Counter | tăng khi markFailed với label reason |
| `deposit_unmatched_total` | Counter | tăng khi tạo UNMATCHED record |
| `deposit_outbox_lag_seconds` | Gauge | `EXTRACT(epoch FROM now()-MIN(created_at)) WHERE published_at IS NULL` |
| `treasury_broadcast_duration_seconds` | Histogram | đo tại `broadcast tx` span |

Dùng `prom-client` hoặc OpenTelemetry exporter; scrape interval 15s.

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
| 1.1 Tăng lock TTL 120s → 300s + heartbeat | `treasury-operations.service.ts:941` | `EX, 300` + setInterval extend |
| 1.2 Giảm attempts 100 → 10, thêm `timeout: 60_000` | `treasury-operations.service.ts:177,230,529` + module | `attempts: 10, timeout: 60_000` |
| 1.3 Fix `buildFundJobId` — bỏ `uuidv7()` + dọn completed/failed trước add | `treasury-operations.service.ts:955` | Xem §4.1 |
| 1.4 Reset `lockWaitTimer` trong `manualRetryTreasuryOperation` | `treasury-operations.service.ts:488` | Gọi `clearLockWaitTimer(operationId)` |
| 1.5 Giới hạn concurrency per partition (tạm 4, KHÔNG global 1) | `treasury.module.ts` / processor | Xem §2.3 |
| 1.6 Manual ingest admin endpoint | `blockchain.controller.ts` | POST endpoint mới + RBAC FINANCE_ADMIN |
| 1.7 Verify `READ_MODEL_ONCHAIN_DEPOSITS` fallback | query service | Integration test + EXPLAIN ANALYZE |
| 1.8 Thêm cột `broadcast_idempotency_key` vào `treasury_operation` | migration | Nullable, unique index partial |
| 1.9 Ghi idempotency key trước RPC broadcast | `treasury-operations.service.ts` processFund/Sweep | Write-before-RPC |

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

// Bổ sung khi enqueue:
const existing = await this.treasuryQueue.getJob(jobId);
if (existing) {
  const state = await existing.getState();
  if (state === 'waiting' || state === 'active' || state === 'delayed') {
    return { operationId: existing.data.operationId, status: 'PENDING', alreadyQueued: true };
  }
  // completed/failed → dọn để add không bị silent-reject
  await existing.remove();
}
await this.treasuryQueue.add(TREASURY_FUND_JOB, data, {
  jobId,
  attempts: 10,
  backoff: { type: 'treasuryDefer', delay: 5_000 },
  removeOnComplete: true,  // BẮT BUỘC vì deterministic jobId
  removeOnFail: true,
  timeout: 60_000,
});
```

> **Chú ý Bull behavior:** `bull` v4 `queue.add()` với jobId đã tồn tại (bất kể state) sẽ **không throw**, trả về job cũ. Vì vậy `existing.remove()` là bắt buộc khi muốn re-enqueue. Test path này kỹ với `removeOnComplete: true` để đảm bảo job completed được dọn tự động.

**Lưu ý:** Khi `jobId` deterministic + `removeOnComplete: true`, job hoàn tất sẽ biến mất khỏi Redis → lần FUND tiếp theo cho cùng ví có thể add bình thường. Enqueue đồng thời 2 FUND sẽ có một request trả `alreadyQueued: true` và một tạo mới — đây chính là dedupe mong muốn.

---

### Phase 2 — Refactor luồng Fund/Sweep (3–5 ngày)

**Mục tiêu:** Serialize per-wallet qua queue, broadcast idempotent, tách confirmation

| Task | Mô tả |
|------|-------|
| 2.1 Tách `waitForBalance` thành `TREASURY_CONFIRM_JOB` | Job riêng, không block main processor |
| 2.2 Chuyển Redis lock từ primary serializer → defensive detector | Lock vẫn acquire nhưng nếu fail → log WARN, không throw (queue đã dedupe) |
| 2.3 Thêm trạng thái `TX_BROADCAST` cho operation | **Migration riêng** dùng `ALTER TYPE … ADD VALUE IF NOT EXISTS 'TX_BROADCAST'` — deploy **trước** code dùng (Postgres enum ALTER non-transactional) |
| 2.4 Implement `processTreasuryConfirmJob` | Retry-able, timeout 5 phút, backoff exponential, reorg re-check |
| 2.5 Migration: thêm `broadcast_idempotency_key`, `tx_broadcast_at` | DB migration additive |
| 2.6 Postgres advisory lock cho enqueueFund/Sweep | Thay `runWithEnqueueLock` Redis spin → `pg_try_advisory_xact_lock(hashtext($walletId))` trong TX |
| 2.7 Per-wallet partition strategy | Khuyến nghị BullMQ group limiter (nếu upgrade); fallback: sub-queue per wallet |
| 2.8 Unit + integration tests scenario treo | `treasury-operations.service.spec.ts`, mô phỏng double-enqueue, RPC timeout, reorg |

**Sơ đồ trạng thái mới:**
```
PENDING → PROCESSING → TX_BROADCAST → COMPLETED
                    ↘              ↘
                     FAILED         FAILED (confirm timeout / reorg)
                                   ↘
                                    REORGED (không credit, alert ops)
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
| Deterministic jobId + `removeOnComplete: false` → silent-reject job mới | **Cao** | BẮT BUỘC `removeOnComplete: true` + `removeOnFail: true`; kèm `existing.remove()` cho state completed/failed; test unit |
| Fix `buildFundJobId` khiến nhiều FUND hợp lệ bị dedupe nhầm | Trung bình | Test kỹ; `alreadyQueued: true` trả về API, caller cần hiểu UX (không phải lỗi) |
| Tách `waitForBalance` → confirm job miss event | Trung bình | Confirm job retry-able, timeout 5 phút, fallback manual settle via runbook |
| Admin match-user credit nhầm user | **Cao** | Dual approval (RISK_OFFICER → FINANCE_ADMIN), idempotency key, immutable audit log, rate limit |
| Migration `UNMATCHED`/`TX_BROADCAST` enum break rolling deploy | Trung bình | Enum ADD VALUE non-transactional — migration deploy trước code dùng 1 release; additive, không xóa |
| Outbox relay chậm → phase 3 items delay | Thấp | Merge query §2.5 + metric `deposit_outbox_lag_seconds` alert |
| Postgres advisory lock key collision do `hashtext` | Thấp | Dùng 2 tham số `pg_try_advisory_xact_lock(classid, objid)` với classid cố định + `hashtextextended(walletId)` |
| TRON reorg gây phantom credit | Thấp (TRON) / Cao (EVM mở rộng) | §2.6 confirmations threshold + reorg re-check trong confirm job |
| Broadcast idempotency key miss → double-broadcast sau crash | Trung bình | Write-before-RPC; partial unique index; test crash recovery |
| Bull queue flood nếu caller spam FUND | Thấp sau fix §4.1 | Deterministic jobId tự dedupe; thêm rate limit ở controller (5 req/phút/admin) |

---

## 6. Thứ tự ưu tiên tuyệt đối

```
[NGAY BÂY]  Phase 1.3 — Fix buildFundJobId (bỏ uuidv7) + removeOnComplete:true + dọn job cũ
[NGAY BÂY]  Phase 1.4 — Reset lockWaitTimer trong manualRetry
[NGAY BÂY]  Phase 1.8 + 1.9 — broadcast_idempotency_key (chống double-broadcast sau crash)
[NGAY BÂY]  Phase 1.6 — Manual ingest admin endpoint (unblock ops)

[TUẦN NÀY]  Phase 1.1 — Lock TTL 300s + heartbeat
[TUẦN NÀY]  Phase 1.2 — attempts=10, timeout=60s
[TUẦN NÀY]  Phase 1.5 — concurrency tuning (KHÔNG global=1)
[TUẦN NÀY]  Phase 1.7 — Verify deposit query fallback + EXPLAIN ANALYZE

[SPRINT NÀY] Phase 2 — Queue-as-serializer + advisory lock + confirm job
[SPRINT SAU] Phase 3 — UNMATCHED + dual-approval admin tools + monitoring + reorg guard
```

### 6.1 Rollout strategy

- **Feature flag** `TREASURY_DETERMINISTIC_JOBID=true` để bật/tắt fix §4.1 trong production; rollback nhanh nếu có hồi quy.
- **Shadow-run** Phase 2 confirm job song song với luồng cũ (poll nhưng không finalize) trong 48h để compare kết quả.
- **Migration deploy trước code** dùng enum values mới 1 release cycle.

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

## 8. SLO/SLI cho Fund/Sweep

### 8.1 Định nghĩa SLI & SLO

| SLI | Đo bằng | SLO Target |
|-----|---------|------------|
| **Fund success rate** | `COUNT(status=COMPLETED) / COUNT(total FUND ops) trong 24h` | ≥ 99.0% |
| **Sweep success rate** | tương tự | ≥ 99.0% |
| **Fund latency P95** | Thời gian từ `created_at` → `updated_at WHERE status=COMPLETED` | ≤ 3 phút |
| **Fund latency P99** | | ≤ 10 phút |
| **Confirm job latency P95** | Thời gian từ `TX_BROADCAST` → `COMPLETED` | ≤ 2 phút |
| **Manual retry resolution time** | Thời gian từ FAILED → COMPLETED sau manual retry | ≤ 30 phút |
| **Queue depth** | `treasury_queue_depth` P95 tại bất kỳ 5-phút nào | ≤ 10 jobs |

### 8.2 Error budget

- Monthly budget (99.0% SLO): **~7.3 giờ downtime** hoặc ~0.01 × tổng số FUND ops có thể fail trong tháng.
- **Burn rate alert:** nếu error rate > 5% trong 1 giờ bất kỳ → page on-call ngay (burn rate ≈ 120× → budget hết trong 36h).
- Tracking: cron job chạy mỗi 5 phút, đếm FAILED / total trong `treasury_operations` và write vào metrics table.

### 8.3 SLO violation thresholds cho alert

```yaml
# Prometheus alert rules (bổ sung vào §3.2)
- alert: TreasuryFundSuccessRateLow
  expr: |
    (
      count_over_time(treasury_operations_total{status="COMPLETED",type="FUND"}[1h])
      /
      count_over_time(treasury_operations_total{type="FUND"}[1h])
    ) < 0.99
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Fund success rate < 99% trong 1h"

- alert: TreasuryFundLatencyHigh
  expr: histogram_quantile(0.95, rate(treasury_operation_duration_seconds_bucket{type="FUND"}[10m])) > 180
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Fund P95 latency > 3 phút"

- alert: TreasuryErrorBudgetBurnHigh
  expr: |
    (
      1 - count_over_time(treasury_operations_total{status="COMPLETED",type=~"FUND|SWEEP"}[1h])
          / count_over_time(treasury_operations_total{type=~"FUND|SWEEP"}[1h])
    ) > 0.05
  for: 10m
  labels:
    severity: critical
  annotations:
    summary: "Treasury error rate > 5% — error budget burning fast"
```

---

## 9. Runbook: Tx broadcast "success" nhưng không lên chain (ghost tx)

**Triệu chứng:** `treasury_operation.status = TX_BROADCAST`, `tx_hash` đã có, nhưng sau >10 phút tx không xuất hiện trên TronScan / không có confirmation nào.

**Nguyên nhân phổ biến:**
- TronGrid API trả `200 OK` nhưng thực ra tx bị drop (RPC node chưa broadcast ra mạng, hoặc `bandwidth/energy` không đủ, hoặc tx expired do `expiration` ngắn).
- Tx bị reject ở mempool sau khi RPC trả thành công.
- Race với tx khác tiêu hết bandwidth → contract validate fail sau khi accept.

### Bước 1 — Xác nhận ghost tx

```sql
-- Tìm operation TX_BROADCAST > 10 phút không có confirmation
SELECT operation_id, wallet_id, type, tx_hash, tx_broadcast_at, updated_at
  FROM treasury_operations
  WHERE status = 'TX_BROADCAST'
    AND tx_broadcast_at < now() - interval '10 minutes';
```

```bash
# Kiểm tra TronScan (thay {TXHASH}):
curl "https://apilist.tronscan.org/api/transaction-info?hash={TXHASH}" | jq '{contractRet, confirmed, block}'
# Nếu contractRet rỗng hoặc 404 → tx không tồn tại on-chain
```

### Bước 2 — Kiểm tra `broadcast_idempotency_key`

```sql
SELECT broadcast_idempotency_key FROM treasury_operations WHERE operation_id = '{id}';
```

- Nếu key **đã set** → tx đã được gửi đi ít nhất một lần; tiếp §Bước 3.
- Nếu key **NULL** → worker crash trước khi gửi; safe to rebroadcast (§Bước 4b).

### Bước 3 — Kiểm tra bandwidth/energy ví

```bash
# TronGrid: lấy account resource
curl "https://api.trongrid.io/v1/accounts/{WALLET_ADDRESS}/resources"
# Xem FreeBandWidth, NetLimit vs NetUsed → nếu NetUsed gần MaxLimit → thiếu bandwidth
```

Nếu thiếu bandwidth: nạp TRX vào ví nguồn, sau đó rebroadcast (§Bước 4a).

### Bước 4 — Xử lý

**4a. Tx confirmed nhưng TronScan lag:** đợi thêm 5 phút, re-check. Nếu vẫn không có → 4b.

**4b. Tx thực sự dropped — rebroadcast an toàn:**
```
POST /treasury/operations/{operationId}/manual-retry
```
- `manualRetryTreasuryOperation` sẽ: release Redis lock + reset status=PENDING + enqueue job mới.
- Job mới sẽ đọc `broadcast_idempotency_key` hiện có → **tạo key mới** (key cũ ứng với tx đã drop, không còn valid) → rebroadcast.
- Monitor lại: tx hash mới phải xuất hiện trên TronScan trong vòng 60s.

**4c. Tx dropped do thiếu energy (contract call) — nạp energy trước:**
- Delegate energy từ main wallet hoặc dùng energy rental service.
- Sau đó mới `manual-retry`.

**4d. Nếu sau 3 lần manual retry vẫn fail:**
```
POST /treasury/operations/{operationId}/manual-abort
```
→ Đánh dấu FAILED với reason `GHOST_TX_UNRECOVERABLE`.
→ Escalate với `RISK_OFFICER`: kiểm tra balance ví xem có bị deduct không, cân nhắc manual journal entry.

### Bước 5 — Post-mortem checklist

- [ ] Nguyên nhân gốc rễ: TronGrid flaky / bandwidth depleted / tx expiration quá ngắn?
- [ ] Tăng `TRON_TX_EXPIRATION_SECONDS` nếu cần (hiện tại bao nhiêu?).
- [ ] Thêm pre-flight check bandwidth trước khi broadcast.
- [ ] Xem xét gọi TronGrid qua 2 endpoint song song để xác nhận tx accepted.
- [ ] Update metric `treasury_ghost_tx_total` (cần thêm counter).

---

## 10. Chaos Testing Plan

**Mục tiêu:** Verify hệ thống hoạt động đúng khi infrastructure bị lỗi đột ngột.

### 10.1 Scope và môi trường

- **Chỉ chạy trên staging**, không bao giờ production.
- Reset full state (DB + Redis) sau mỗi scenario.
- Dùng mock TronGrid provider (`MockBlockchainProvider`) với điều khiển inject lỗi.

### 10.2 Scenario matrix

#### Group A — Redis failures

| Scenario | Cách inject | Expected behavior |
|----------|------------|-------------------|
| **A1 Redis flush giữa chừng** | Flush Redis sau khi job enqueued nhưng trước khi processed | Confirm job mất → manual retry; operation vẫn ở PENDING; không double-broadcast |
| **A2 Redis down khi acquire lock** | `redis.set` throw `ECONNREFUSED` | `tryAcquireWalletLock` return null → WALLET_BUSY retry; sau khi Redis recover → job tiếp tục |
| **A3 Redis eviction (maxmemory)** | Set Redis `maxmemory 1mb`, enqueue nhiều jobs | Bull job data bị evict → Bull reconnect + reprocess; assert `broadcast_idempotency_key` prevent double-send |
| **A4 Lock TTL expire giữa broadcast** | TTL 5s (test only), broadcast mock delay 10s | Lock expire giữa chừng → defensive detector log WARN; **không** double-broadcast vì jobId dedupe + idempotency key |

```typescript
// Test helper để inject Redis error:
jest.spyOn(redisClient, 'set').mockRejectedValueOnce(new Error('ECONNREFUSED'));
```

#### Group B — RPC / TronGrid failures

| Scenario | Cách inject | Expected behavior |
|----------|------------|-------------------|
| **B1 RPC trả HTTP 500** | MockProvider throw `RpcException('500')` | Job fail → `treasuryDeferBackoff` retry; sau `attempts` hết → FAILED; manual retry available |
| **B2 RPC timeout (30s)** | MockProvider delay 35s, job `timeout: 60_000` | Bull timeout kills job → rethrow; Bull retry; confirm idempotency key set trước RPC → retry biết đã broadcast |
| **B3 RPC trả success nhưng tx dropped** | MockProvider trả txHash hợp lệ nhưng `resolveDepositTransfers` không tìm thấy tx sau 2 phút | Confirm job timeout → status=FAILED; runbook §9 |
| **B4 RPC trả duplicate tx hash** | MockProvider trả cùng txHash cho 2 operation khác nhau | Unique constraint trên `tx_hash` column → second update fails → alert ops |
| **B5 RPC intermittent (50% fail rate)** | MockProvider random throw/success | Backoff retry eventually succeeds; P95 latency SLO vẫn đạt |

```typescript
// Chaos helper:
class ChaosMockProvider implements BlockchainProvider {
  private failRate = 0;
  setFailRate(rate: number) { this.failRate = rate; }
  async broadcastTransaction() {
    if (Math.random() < this.failRate) throw new RpcException('chaos inject');
    return { txHash: 'mock-' + uuidv7() };
  }
}
```

#### Group C — Worker crash scenarios

| Scenario | Cách inject | Expected behavior |
|----------|------------|-------------------|
| **C1 Worker crash sau write idempotency key, trước broadcast** | `process.exit(1)` sau `UPDATE broadcast_idempotency_key` | Retry worker đọc key → tạo key mới (tx cũ drop) → rebroadcast safe |
| **C2 Worker crash sau broadcast, trước update tx_hash** | `process.exit(1)` sau RPC call, trước DB write | Retry đọc key đã set → biết đã broadcast → check tx_hash trên chain by re-polling → cập nhật tx_hash |
| **C3 Worker crash sau TX_BROADCAST status, trước enqueue confirm job** | `process.exit(1)` giữa 2 writes | Confirm job không được enqueue; cần **reconciliation job** chạy mỗi 1 phút: tìm `TX_BROADCAST` > 2 phút không có confirm job → re-enqueue |
| **C4 OOM kill (SIGKILL)** | `docker kill --signal=SIGKILL worker` | Bull job trở về `active` state rồi failed → retry mechanism kicks in |

#### Group D — Database failures

| Scenario | Cách inject | Expected behavior |
|----------|------------|-------------------|
| **D1 DB timeout khi update status** | Inject `pg_sleep(10)` via query hook | TX timeout → job retry; `broadcast_idempotency_key` đã set → không double-broadcast |
| **D2 DB connection pool exhausted** | Set pool max=1, flood concurrent requests | Queue up, no double-broadcast; SLO latency alert fires |
| **D3 DB primary failover** | Stop primary, promote replica | 30–60s downtime; jobs pause; resume after failover; no data loss |

### 10.3 Reconciliation job (bắt buộc cho C3)

```typescript
// Chạy mỗi 1 phút bởi NestJS @Cron
@Cron('*/1 * * * *')
async reconcileTxBroadcastOperations(): Promise<void> {
  const stale = await this.treasuryOperationRepository.findByStatusOlderThan(
    'TX_BROADCAST',
    2, // minutes
  );
  for (const op of stale) {
    const confirmJob = await this.treasuryQueue.getJob(`treasury-confirm:${op.operation_id}`);
    if (!confirmJob) {
      this.logger.warn(`Reconcile: re-enqueue confirm for operation=${op.operation_id}`);
      await this.treasuryQueue.add(TREASURY_CONFIRM_JOB, { operationId: op.operation_id }, {
        jobId: `treasury-confirm:${op.operation_id}`,
        attempts: 10,
        removeOnComplete: true,
      });
    }
  }
}
```

### 10.4 Automation

```bash
# Script chạy full chaos suite (staging):
npm run test:chaos -- --scenario=A1,A4,B1,B3,C1,C2,C3

# Mỗi scenario:
# 1. Setup state (seed DB, flush Redis)
# 2. Inject failure
# 3. Trigger operation
# 4. Wait timeout
# 5. Assert expected final state
# 6. Assert no double-credit in wallet balance
# 7. Teardown
```

Kết quả chaos test phải pass trước mỗi Phase 2 release.

---

## 7. Files cần thay đổi (tổng hợp)

| File | Phase | Loại thay đổi |
|------|-------|--------------|
| `treasury/treasury-operations.service.ts` | 1, 2 | Fix jobId, TTL, attempts, remove lock |
| `treasury/treasury.processor.ts` | 2 | Add confirm processor |
| `treasury/treasury.module.ts` | 1, 2 | Concurrency config |
| `treasury/treasury-queue-backoff.ts` | 1 | Tune delays |
| `treasury/treasury-reconciliation.scheduler.ts` | 2 | Reconcile TX_BROADCAST stale ops |
| `blockchain/blockchain.controller.ts` | 1, 3 | Admin endpoints |
| `blockchain/application/use-cases/deposits/onchain-deposit.service.ts` | 3 | UNMATCHED logic |
| `blockchain/deposit-watcher/deposit-ingestion.service.ts` | 3 | createUnmatched flow |
| `entities/onchain-transaction.entity.ts` | 3 | UNMATCHED status enum |
| DB migrations | 2, 3 | TX_BROADCAST, UNMATCHED, broadcast_idempotency_key |
| `read-onchain-user-transactions.query.service.ts` | 1 | Verify UNION fallback |
| `test/chaos/` | 2 | Chaos test suite |

---

*Plan này tập trung vào correctness trước performance. Sau khi luồng stable, mới optimize throughput (parallel FUND cho các ví khác nhau, etc.).*
