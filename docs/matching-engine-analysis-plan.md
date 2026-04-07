# Phân tích & cải thiện logic Matching Engine

**Loại tài liệu:** Phân tích + tư vấn (không phải implementation).  
**Ngày:** 2026-04-07  

---

## Bối cảnh

Đánh giá logic ghép lệnh (order matching) so với các sàn hàng đầu (Binance, Coinbase, Kraken…), xác định điểm yếu nghiêm trọng và đề xuất hướng cải thiện — không chỉ bắt chước mà còn vượt qua nếu có thể.

---

## Tóm tắt hiện trạng codebase

| Thành phần | Hiện trạng |
|------------|------------|
| Order types | LIMIT, MARKET + TIF: GTC / IOC / FOK |
| Matching algo | Price–Time Priority (maker price discovery) |
| Concurrency | Redis spinlock theo pair + DB stored procedure |
| Book refresh | Full rebuild từ DB mỗi lần match |
| Balance guard | 2 lớp: TypeScript pre-check + SP re-check (cả hai non-locking) |
| Audit | Chỉ console log |
| Partial fill | Có xử lý |
| Self-trade prevention | Không có |
| Float arithmetic | `parseFloat` dùng rộng rãi |

---

## CRITICAL — ảnh hưởng tài chính trực tiếp

### 1. Không có Self-Trade Prevention (STP)

**Vấn đề:** Người dùng có thể ghép lệnh mua và bán của chính mình. Không có kiểm tra ở application layer lẫn stored procedure.

**Hậu quả:**

- **Wash trading:** Volume ảo, gây hiểu lầm thị trường → rủi ro pháp lý (MiFID II, quy định SEC).
- **Market manipulation:** Một tài khoản kiểm soát cả hai phía để thao túng giá.
- **Fee exploitation:** Nếu maker/taker fee khác nhau, self-trade có thể dùng để arbitrage phí.

**Thực hành sàn lớn:** Binance, Kraken có STP với các mode: `CANCEL_OLDEST`, `CANCEL_NEWEST`, `CANCEL_BOTH`, `DECREMENT_AND_CANCEL`.

**Đề xuất:** Triển khai STP ở **application layer** (fail-fast trước khi lock) **và** **SP layer** (atomicity). Mặc định: `CANCEL_NEWEST` (taker bị hủy); cho phép cấu hình theo tài khoản.

---

### 2. Race condition trong balance freeze — rủi ro overdraft

**Vấn đề:** Trong `sp_order_create`, balance check là `SELECT COALESCE(available, 0)` — đọc non-locking. Hai giao dịch đồng thời (ví dụ batch order `Promise.all`) có thể:

1. Cả hai đọc `available = 100`
2. Cả hai thấy đủ balance
3. Cả hai `UPDATE wallets SET available = available - 100`
4. Kết quả: `available` âm

**Hậu quả:** Đặt lệnh với số dư ảo; khi settle thiếu tiền → bad debt trên sàn.

**Đề xuất:** Thêm `SELECT … FOR UPDATE` trên dòng wallet trong `sp_order_create` (SQL chuẩn, không cần redesign toàn bộ).

---

### 3. Float arithmetic trong tính toán tài chính

**Vấn đề:** `parseFloat()` dùng rộng trong matching engine và fee calculation. IEEE 754 gây sai số (ví dụ `0.1 + 0.2`). DB lưu `DECIMAL(36,18)` nhưng lên JS có thể mất precision.

**Hậu quả:** Lỗi làm tròn tích lũy → ledger lệch, fill/fee sai; volume lớn thì sai số đáng kể.

**Đề xuất vượt mức chỉ dùng decimal.js:**

- Lưu amount dạng **integer base units** (ví dụ satoshi: 1 BTC = 100_000_000).
- Toàn bộ tính toán integer — không sai số float.
- Chỉ chuyển decimal khi hiển thị cho user.
- Cách làm phổ biến trong fintech (Stripe, Square, v.v.).

---

### 4. Redis lock không an toàn multi-node / TTL

**Vấn đề 1 — release lock:** Dùng `DEL` key mà không xác minh giá trị lock. Nếu TTL (ví dụ 10s) hết khi process A vẫn chạy:

1. A mất lock → B acquire
2. A xong, gọi `DEL` → xóa lock của B
3. B vẫn chạy nhưng lock đã mất → C có thể acquire → hai process matching song song

**Vấn đề 2:** Redis Cluster / failover: lock đơn node không đạt độ an toàn Redlock (N/2+1 nodes).

**Hậu quả:** Double-spend, trade trùng, order book hỏng.

**Đề xuất:** So sánh và xóa atomic (chỉ `DEL` nếu value == token của mình), thường dùng **Lua script** trong Redis.

---

## HIGH — performance & scalability

### 5. Full order book rebuild mỗi lần match

**Vấn đề:** Mỗi order mới load lại toàn bộ book từ DB. Pair 10k lệnh mở → mỗi order có thể kéo theo scan lớn.

**Hậu quả:** Latency O(n) theo độ sâu, CPU DB spike, khó scale.

**Đề xuất:** In-memory order book (Redis sorted set hoặc in-process) làm nguồn sự thật cho matching; DB là persistence / backup. Cập nhật **incremental**; persist bất đồng bộ khi add/cancel/fill.

---

### 6. Matching đồng bộ trên request thread

**Vấn đề:** Đặt lệnh chạy matching ngay trên luồng HTTP; book sâu → nhiều fill → response chậm.

**Đề xuất:** Tách tạo lệnh và thực thi:

- `POST /orders`: validate, persist trạng thái `QUEUED`, trả về nhanh.
- Consumer (ví dụ Bull/BullMQ) xử lý matching.
- Kết quả đẩy qua WebSocket.

---

### 7. Subscription in-memory không đồng bộ giữa các instance

**Vấn đề:** `TradingSubscriptionService` giữ state trong memory; scale horizontal → user reconnect instance khác mất subscription.

**Đề xuất:** Socket.IO Redis Adapter (thường chỉ cần cấu hình thêm).

---

## MEDIUM — business logic & compliance

### 8. Audit trail chỉ console log

**Vấn đề:** `AuditTradeVisitor` chỉ `console.log` — không lưu bền.

**Hậu quả:** Khó audit sau restart; không đáp ứng yêu cầu compliance (ví dụ MiFID II lưu trade record nhiều năm).

**Đề xuất:** Bảng `trade_audit_log` hoặc event store append-only.

---

### 9. Không có price protection cho market orders

**Vấn đề:** Market order fill không điều kiện — book có giá cực đoan (ví dụ ask $1M khi mid ~$100) vẫn có thể khớp.

**Đề xuất:** **Market order price protection** — `slippage_tolerance` (% lệch so với mid). Vượt ngưỡng thì reject — cải thiện UX và rủi ro.

---

### 10. Không có circuit breaker / trading halt

**Vấn đề:** Biến động giá cực đại (crash/pump) không có cơ chế dừng tạm.

**Đề xuất:** Circuit breaker — nếu giá đổi > X% trong Y giây → halt pair, thông báo admin và user.

---

## Roadmap cải thiện theo độ ưu tiên

### Phase 1 — Sửa ngay (không redesign)

| # | Task | File / vị trí | Effort |
|---|------|----------------|--------|
| 1 | Self-trade prevention | `matching/strategies/`, `sp_trade_execute` | 1–2 ngày |
| 2 | Sửa release Redis lock (Lua) | `matching/matching.service.ts` | ~2h |
| 3 | Thêm `FOR UPDATE` trong `sp_order_create` | DB migration | ~4h |
| 4 | Thay `parseFloat` bằng decimal.js trong matching | `matching/strategies/` | ~1 ngày |

### Phase 2 — Kiến trúc

| # | Task | Approach | Effort |
|---|------|----------|--------|
| 5 | In-memory order book incremental | Redis Sorted Sets | ~1 tuần |
| 6 | Matching tách queue | BullMQ, order-execution queue | ~1 tuần |
| 7 | Socket.IO Redis Adapter | Config | ~2h |
| 8 | Audit persistent | Bảng mới + refactor visitor | ~1 ngày |

### Phase 3 — Nghiệp vụ & dài hạn

| # | Task | Giá trị |
|---|------|---------|
| 9 | Market order slippage / price protection | UX + risk |
| 10 | Circuit breaker theo pair | Risk management |
| 11 | Integer base units cho amount | Toàn vẹn tài chính lâu dài |
| 12 | STP configurable theo account | UX + compliance |

---

## Hướng đi vượt mức “bắt chước sàn”

1. **Event-sourced order book:** Mỗi sự kiện (`OrderPlaced`, `OrderCancelled`, `TradeExecuted`) bất biến; trạng thái book là tổng hợp events — audit, replay, reconcile, truy vấn “book tại thời điểm T” (tương tự hướng nhiều hệ thống trading chuyên nghiệp).

2. **Deterministic integer arithmetic:** Tránh phụ thuộc decimal mềm; int64 base units; tương thích settlement on-chain nếu cần.

3. **Idempotent order processing:** Mọi mutation gắn event log idempotent; crash/restart replay không tạo trade trùng (mở rộng idempotency key hiện có sang matching/settlement).

4. **Transparent price discovery:** Public API snapshot depth (5/10/20) + trade history, không chỉ WebSocket — tăng niềm tin người dùng.

---

## Verification & bước tiếp theo

Đây là tài liệu phân tích — không có thay đổi code để verify trong PR này.

1. Ưu tiên Phase 1 — review team, tạo task trên board.
2. PoC fix Redis lock (Redis CLI + concurrent requests).
3. Load test đo baseline latency của full-rebuild trước khi tối ưu book.
4. Compliance review (luật sư / compliance) về STP và yêu cầu audit.

---

*Tài liệu được ghi từ phân tích nội bộ về matching engine so với thực hành sàn và fintech.*
