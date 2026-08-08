# INTENT.md — wallets/ Module

> **Module**: `src/modules/wallets/`
> **Owner**: Backend team
> **Last reviewed**: 2026-08-09 (ECC 2.2.0 upgrade — skill `intent-driven-development`)

## Purpose

Quản lý user-linked wallets (managed + external):

- Link wallet (signature verification)
- Unlink wallet
- List wallets per user
- Default wallet selection
- WalletConnect session management (Reown AppKit)
- Wallet balance summary (delegated to treasury)

## Business Invariants (KHÔNG ĐƯỢC PHÉP SAI)

1. **Linking MUST verify signature** with `personal_sign` or `eth_signTypedData_v4` (EIP-712).
2. **Test signature bypass** (`BLOCKCHAIN_ALLOW_TEST_SIGNATURE`) only when email OTP verified.
3. **One user can have ONE default wallet per chain.** Reassigning default unsets the previous.
4. **Wallet unlock** MUST be applied before any operation; locked wallets return 423.
5. **Linked-at timestamp** is immutable; `updated_at` tracks state changes.
6. **WalletConnect session** timeout default 24h; refresh requires user interaction.

## Threat Model

| Attacker | Vector | Mitigation |
|---|---|---|
| External | Link arbitrary wallet | Signature verification + nonce check |
| External | Replay link signature | Single-use nonce (5m TTL) |
| External | Wallet hijack | Show address on confirm screen |
| External | Session hijack | WC session timeout + rotation |
| Internal | Privilege escalation | RBAC guards |

## Test Coverage Gate

**Required: 100% line + branch coverage for `*.service.ts` + `*.controller.ts` files.**

## SENSITIVE FILES

- `wallets.service.ts` — Link/unlink + default selection
- `signature-verifier.service.ts` — EIP-191 / EIP-712 validation
- `wallet-connect.service.ts` — Reown AppKit wrapper
- `wallets.controller.ts`

## FURTHER READING

- `docs/security-zones.md`
- ECC skill `security-review`
- ECC skill `error-handling`
