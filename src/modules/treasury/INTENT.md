# INTENT.md — treasury/ Module

> **Module**: `src/modules/treasury/`
> **Owner**: Backend team
> **Last reviewed**: 2026-08-09 (ECC 2.2.0 upgrade — skill `intent-driven-development`)

## Purpose

Quản lý ví nóng (hot wallets) cho toàn nền tảng:

- Native + token balance tracking
- Deposit monitoring + credit
- Withdraw request lifecycle (created → pending → broadcast → confirmed)
- Auto-approve amounts up to per-chain max
- Cross-chain reconciliation
- Chain-specific RPC health

## Business Invariants (KHÔNG ĐƯỢC PHÉP SAI)

1. **Withdraw CANNOT be double-broadcast.** Each withdrawal must have a unique `tx_hash` check before broadcast.
2. **Balance cannot be negative** under any operation. Every withdrawal MUST verify sufficient balance at lock time AND before broadcast.
3. **Auto-approve threshold** (`BLOCKCHAIN_WITHDRAW_AUTO_MAX`) — withdraws within this amount process automatically; larger require manual review.
4. **Auto-approve MIN** (`BLOCKCHAIN_WITHDRAW_AUTO_MIN`) — withdraws below this amount require manual review (anti-dust).
5. **Wallet lock status** (`WALLET_LOCKED*` keys) MUST be checked before any operation.
6. **Daily limit per user** (`fraud.withdrawal_daily_limit_usd`) — sum of confirmed withdrawals per user per 24h cannot exceed this without additional review.
7. **All withdrawal operations** MUST be idempotent. Use `idempotency_key` from client.
8. **Reconciliation** must run every `WALLET_SYNC_INTERVAL` ms; failed reconciliation raises ops alert.
9. **Gas estimation** must include safety buffer; never broadcast under-priced tx.
10. **Address validation** MUST use chain-specific validator (no shared regex).

## Threat Model

| Attacker | Vector | Mitigation |
|---|---|---|
| External | Withdraw replay | Idempotency key + tx_hash uniqueness |
| External | Double-spend race | UoW transaction + balance row lock |
| External | Address substitution | Validate destination == intended at broadcast |
| External | Dust spam | Auto-min threshold for manual review |
| External | Wash-withdrawal | Daily limit + velocity checks |
| External | Front-run | EIP-1559 with priority fee + nonce mgmt |
| External | Private key leak | Hardware-backed signing (HSM) where possible |
| External | RPC poisoning | Multi-RPC quorum; reject on mismatch |
| Internal | Privilege escalation | Withdraw requires `treasury:write` role |
| Internal | Audit log tampering | Outbox + immutable ledger table |

## Test Coverage Gate

**Required: 100% line + branch coverage for `*.service.ts` + `*.controller.ts` files.**

CI fails if coverage < 100% for any file in this module.

## SENSITIVE FILES

- `treasury.service.ts` — Core withdraw/deposit operations
- `wallet-balance.service.ts` — Balance ledger + reconciliation
- `withdraw-broadcaster.service.ts` — Chain-specific tx broadcast
- `chain-health.service.ts` — RPC health checks
- `auto-approve.service.ts` — Threshold + min logic
- `address-validator.service.ts` — Chain-specific address validation
- `treasury.controller.ts` — HTTP boundary

## CHAIN COVERAGE

Read `src/common/constants/evm-chain-definitions.ts` for the canonical list. Any new chain added there MUST also:
- Add a new `BLOCKCHAIN_WITHDRAW_AUTO_MAX_<CHAIN>` key to `runtime-settings.definitions.ts`
- Add an integration test in `test/integration/treasury/`
- Update reconciliation to read new chain

## FURTHER READING

- `docs/ARCHITECTURE.md` — Outbox pattern, UoW
- `docs/ARCHITECTURE_FULL_ROLLOUT.md` — `published_at`, skip_locked
- `docs/security-zones.md`
- `VIBE_CODE.md`
- ECC skill `error-handling` — Use `TreasuryError` subclasses
- ECC skill `production-audit` — Production-readiness checklist
