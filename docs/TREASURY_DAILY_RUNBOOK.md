# Hướng dẫn vận hành kho bạc hàng ngày (Treasury Daily Runbook - Phát triển)

Chạy mọi lệnh `npm run treasury:*` từ thư mục **`be-cryptocurrency-trading-app`** (backend đã cài `npm install`).

Hướng dẫn này được sử dụng để củng cố quy trình nạp/rút coin trên mạng thử nghiệm (testnet), tuân theo các nguyên tắc:
- Backend (BE) quản lý trạng thái tài chính.
- Sổ cái ví nội bộ (Internal wallet ledger) là nguồn thông tin chính xác duy nhất (source of truth).
- Rút tiền kết hợp: số lượng nhỏ tự động duyệt (auto), số lượng lớn cần duyệt thủ công (manual review).

## 1) Mục tiêu hàng ngày

1. Xác minh luồng E2E (End-to-End) cho việc rút tiền tự động và rút tiền cần phê duyệt thủ công hoạt động đúng.
2. (Tùy chọn) Xác minh việc gửi/quyết toán nạp tiền on-chain nếu có mã giao dịch (txHash) hợp lệ.
3. Chạy kiểm tra sức khỏe (health check) và báo cáo đối soát (reconciliation report).
4. Cảnh báo sớm cho các tình huống có nguy cơ về tài chính trong môi trường phát triển.

## 2) Các lệnh thực thi

Chạy toàn bộ quy trình hàng ngày:

```bash
npm run treasury:daily
```

Trong môi trường phát triển (dev), trình chạy mặc định:
- `TREASURY_E2E_ALLOW_SKIP=true` (nếu thiếu biến môi trường E2E thì bỏ qua, không báo lỗi).
- `TREASURY_HEALTH_FAIL_ON_CRITICAL=false` (nếu có cảnh báo nghiêm trọng vẫn ghi log, không làm dừng tác vụ).

Nếu cần chạy đầy đủ E2E, hãy tạo file `scripts/treasury-e2e.env` từ mẫu:
- `scripts/treasury-e2e.env.example`

Chạy riêng luồng E2E:

```bash
npm run treasury:e2e
```

Chạy riêng kiểm tra sức khỏe và báo cáo đối soát:

```bash
npm run treasury:health
```

Đăng ký Windows Task Scheduler (02:30 mỗi ngày):

```bash
npm run treasury:schedule:register
```

Mặc định tác vụ được tạo với `RunLevel=Limited` để tránh lỗi quyền truy cập.
Nếu cần `RunLevel=Highest`, hãy chạy script trực tiếp với quyền quản trị (admin):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/register-treasury-daily-task.ps1 -RunWithHighest
```

Gỡ bỏ tác vụ trong Task Scheduler:

```bash
npm run treasury:schedule:unregister
```

## 3) Biến môi trường cho script E2E

Bắt buộc:
- E2E_API_BASE_URL (ví dụ: http://127.0.0.1:3000)
- E2E_BEARER_TOKEN_TRADER
- E2E_BEARER_TOKEN_RISK
- E2E_CHAIN (ETH_SEPOLIA | SOLANA_DEVNET | TRON_NILE | TRON_SHASTA)
- E2E_LINKED_WALLET_ID
- E2E_WITHDRAW_AMOUNT_AUTO
- E2E_WITHDRAW_AMOUNT_MANUAL

Tùy chọn (để chạy nạp tiền on-chain):
- E2E_DEPOSIT_TX_HASH
- E2E_DEPOSIT_AMOUNT

Chế độ bỏ qua E2E khi thiếu biến môi trường (để pipeline không bị dừng):
- TREASURY_E2E_ALLOW_SKIP=true

## 4) Các quy tắc cảnh báo tối thiểu (phát triển)

Script `treasury:health` sẽ cảnh báo theo các quy tắc sau:

1. Nghiêm trọng (Critical): Các lệnh rút tiền thủ công đang chờ > `TREASURY_ALERT_STALE_MANUAL_MINUTES` (mặc định 15 phút).
2. Cảnh báo (Warning): Giao dịch ở trạng thái `CONFIRMING` > `TREASURY_ALERT_STALE_CONFIRMING_MINUTES` (mặc định 30 phút).
3. Nghiêm trọng (Critical): Số lượng lệnh rút tiền thất bại (FAILED) trong 24 giờ >= `TREASURY_ALERT_FAILED_WITHDRAWALS_24H` (mặc định 10).
4. Nghiêm trọng (Critical): Giá trị đối soát sai lệch (reconcile mismatch) có trị tuyệt đối > `WALLET_RECONCILIATION_THRESHOLD`.

Nếu có cảnh báo nghiêm trọng, script sẽ trả về exit code 1.
Lưu ý: hành vi này chỉ xảy ra khi `TREASURY_HEALTH_FAIL_ON_CRITICAL=true`.

## 5) Các giá trị ngưỡng cho kiểm tra sức khỏe (Health check threshold)

- TREASURY_ALERT_STALE_MANUAL_MINUTES=15
- TREASURY_ALERT_STALE_CONFIRMING_MINUTES=30
- TREASURY_ALERT_FAILED_WITHDRAWALS_24H=10
- TREASURY_RECONCILE_PAIR_LIMIT=100
- WALLET_RECONCILIATION_THRESHOLD=0.001

## 6) Endpoint xuất báo cáo đối soát định dạng JSON

Endpoint:
- `POST /api/v1/wallets/reconciliation-report/export?limit=100`

Phân quyền (RBAC):
- Vai trò: `ADMIN` hoặc `RISK_OFFICER`
- Quyền hạn: `risk:review`

File đầu ra (Output file):
- `reports/reconciliation/YYYY-MM-DD.json`

Định dạng file:
- File là một mảng JSON (array), mỗi lần xuất sẽ thêm (append) một mục (entry) mới.
- Mỗi mục bao gồm: `reportAt`, `actorUserId`, `summary`, `items`.

## 7) Danh sách kiểm tra vận hành (Operational Checklist)

1. Kiểm tra báo cáo JSON của `treasury:e2e`: số lượng bước thất bại (step failed) phải bằng 0.
2. Kiểm tra báo cáo JSON của `treasury:health`: số lượng cảnh báo nghiêm trọng (criticalAlerts) phải bằng 0.
3. Nếu có cảnh báo:
- Chậm trễ phê duyệt thủ công (Stale manual): sử dụng các endpoint process/approve/reject để xử lý.
- Chậm trễ xác nhận (Stale confirming): kiểm tra nhà cung cấp RPC và trạng thái giao dịch.
- Tăng đột biến số lệnh thất bại (Failed spike): kiểm tra mạng lưới (chain)/nhà cung cấp/khung thời gian, tạm dừng tự động duyệt nếu cần.
- Sai lệch đối soát (Reconcile mismatch): đối chiếu sổ cái (ledger)/ví/ngoại vi và tạo ghi chú sự cố (incident note).

## 8) Ghi nhật ký chuẩn kho bạc (Standard Treasury Logging)

Các sự kiện quan trọng đã được ghi nhật ký với định dạng JSON trong blockchain service:
- withdraw.request.received
- withdraw.request.idempotent_hit
- withdraw.request.pending_manual_review
- withdraw.request.result
- withdraw.request.send_failed (cảnh báo)
- withdraw.manual.approve.requested
- withdraw.manual.approve.result
- withdraw.manual.approve.send_failed (cảnh báo)
- withdraw.manual.reject.requested
- withdraw.manual.reject.result
- deposit.submit.result
- deposit.settle.requested
- deposit.settle.waiting_confirmations
- deposit.settle.result
- deposit.settle.chain_failed (cảnh báo)

Khuyến nghị sử dụng bộ lọc log theo `domain=treasury` để theo dõi nhanh chóng.
