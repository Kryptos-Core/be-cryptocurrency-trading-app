# Treasury Daily Runbook (Development)

Runbook nay dung cho hardening luong nap/rut coin tren testnet, theo nguyen tac:
- BE quan ly state tai chinh
- Internal wallet ledger la source of truth
- Hybrid withdrawal: amount nho auto, amount lon manual review

## 1) Muc tieu daily

1. Xac minh E2E luong rut auto + rut manual approval chay dung.
2. (Tuy chon) Xac minh submit/settle nap on-chain neu co txHash hop le.
3. Chay health check va reconciliation report.
4. Bat alert som cho cac tinh huong nguy co tai chinh trong dev.

## 2) Lenh chay

Chay ca bo daily:

```bash
npm run treasury:daily
```

Trong dev, runner mac dinh:
- `TREASURY_E2E_ALLOW_SKIP=true` (thieu env E2E thi skip, khong fail)
- `TREASURY_HEALTH_FAIL_ON_CRITICAL=false` (co critical alert thi van log, khong fail task)

Neu can full E2E, tao file `scripts/treasury-e2e.env` tu mau:
- `scripts/treasury-e2e.env.example`

Chay rieng E2E:

```bash
npm run treasury:e2e
```

Chay rieng health + reconcile report:

```bash
npm run treasury:health
```

Dang ky Windows Task Scheduler (02:30 moi ngay):

```bash
npm run treasury:schedule:register
```

Mac dinh task duoc tao voi RunLevel=Limited de tranh loi permission.
Neu can RunLevel=Highest, chay script truc tiep voi quyen admin:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/register-treasury-daily-task.ps1 -RunWithHighest
```

Go bo task scheduler:

```bash
npm run treasury:schedule:unregister
```

## 3) Bien moi truong cho E2E script

Bat buoc:
- E2E_API_BASE_URL (vi du: http://127.0.0.1:3000)
- E2E_BEARER_TOKEN_TRADER
- E2E_BEARER_TOKEN_RISK
- E2E_CHAIN (ETH_SEPOLIA | SOLANA_DEVNET | TRON_NILE | TRON_SHASTA)
- E2E_LINKED_WALLET_ID
- E2E_WITHDRAW_AMOUNT_AUTO
- E2E_WITHDRAW_AMOUNT_MANUAL

Tuy chon (de chay nap on-chain):
- E2E_DEPOSIT_TX_HASH
- E2E_DEPOSIT_AMOUNT

Che do bo qua E2E khi thieu env (de pipeline khong fail cung):
- TREASURY_E2E_ALLOW_SKIP=true

## 4) Alert rules toi thieu (development)

Script `treasury:health` se canh bao theo cac rule sau:

1. Critical: Pending manual withdrawal > TREASURY_ALERT_STALE_MANUAL_MINUTES (mac dinh 15 phut).
2. Warning: Tx trang thai CONFIRMING > TREASURY_ALERT_STALE_CONFIRMING_MINUTES (mac dinh 30 phut).
3. Critical: So withdrawal FAILED trong 24h >= TREASURY_ALERT_FAILED_WITHDRAWALS_24H (mac dinh 10).
4. Critical: Reconcile mismatch co tri tuyet doi > WALLET_RECONCILIATION_THRESHOLD.

Neu co critical alert, script se exit code 1.
Luu y: hanh vi nay chi dung khi `TREASURY_HEALTH_FAIL_ON_CRITICAL=true`.

## 5) Bien threshold cho health check

- TREASURY_ALERT_STALE_MANUAL_MINUTES=15
- TREASURY_ALERT_STALE_CONFIRMING_MINUTES=30
- TREASURY_ALERT_FAILED_WITHDRAWALS_24H=10
- TREASURY_RECONCILE_PAIR_LIMIT=100
- WALLET_RECONCILIATION_THRESHOLD=0.001

## 6) Endpoint export reconcile history JSON

Endpoint:
- `POST /api/v1/wallets/reconciliation-report/export?limit=100`

RBAC:
- Role: `ADMIN` hoac `RISK_OFFICER`
- Permission: `risk:review`

Output file:
- `reports/reconciliation/YYYY-MM-DD.json`

Dinh dang file:
- File la mang JSON (array), moi lan export append 1 entry moi.
- Moi entry gom `reportAt`, `actorUserId`, `summary`, `items`.

## 7) Checklist van hanh

1. Kiem tra report JSON cua `treasury:e2e`: so step failed phai = 0.
2. Kiem tra report JSON cua `treasury:health`: criticalAlerts phai = 0.
3. Neu co canh bao:
- Stale manual: dung endpoint process/approve/reject de giai quyet.
- Stale confirming: kiem tra RPC provider va transaction status.
- Failed spike: khoanh vung chain/provider/time window, tam dung auto max neu can.
- Reconcile mismatch: doi soat ledger/wallet/external va tao incident note.

## 8) Logging chuan treasury

Cac event quan trong da duoc log voi format JSON trong service blockchain:
- withdraw.request.received
- withdraw.request.idempotent_hit
- withdraw.request.pending_manual_review
- withdraw.request.result
- withdraw.request.send_failed (alert)
- withdraw.manual.approve.requested
- withdraw.manual.approve.result
- withdraw.manual.approve.send_failed (alert)
- withdraw.manual.reject.requested
- withdraw.manual.reject.result
- deposit.submit.result
- deposit.settle.requested
- deposit.settle.waiting_confirmations
- deposit.settle.result
- deposit.settle.chain_failed (alert)

Khuyen nghi filter log theo `domain=treasury` de theo doi nhanh.
