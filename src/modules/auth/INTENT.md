# INTENT.md — auth/ Module

> **Module**: `src/modules/auth/`
> **Owner**: Backend team
> **Last reviewed**: 2026-08-09 (ECC 2.2.0 upgrade — skill `intent-driven-development`)

## Purpose

Quản lý vòng đời user authentication trên toàn bộ stack:

- Email / password registration & login
- Email OTP verification (gating sensitive ops)
- Refresh token rotation
- Account lockout / unlock
- Session enumeration
- Password change (with OTP gate)

## Business Invariants (KHÔNG ĐƯỢC PHÉP SAI)

1. **Passwords are NEVER stored in plaintext.** Only bcrypt (cost factor >= 12) or argon2id.
2. **JWT access tokens** must be short-lived (default 15m). Refresh tokens rotate on each use.
3. **OTP codes** must be single-use, time-limited (default 5m), and rate-limited (max 5 attempts / 15m).
4. **OTP bypass ONLY** when `BLOCKCHAIN_ALLOW_TEST_SIGNATURE=true` (non-production) AND `EMAIL_VERIFICATION_REQUIRED=false`.
5. **Email enumeration MUST be prevented** — register/login responses must not reveal whether email exists.
6. **Account lockout** triggers after 5 failed login attempts within 15m; lockout lasts 30m.
7. **All auth events** MUST be written to audit log (success + failure, with metadata).
8. **Refresh token reuse** MUST invalidate the entire token family (detection of token theft).

## Threat Model

| Attacker | Vector | Mitigation |
|---|---|---|
| External | Brute force login | bcrypt cost + lockout + rate-limit |
| External | Credential stuffing | lockout + audit log + alerting |
| External | Token theft | Short access TTL + refresh rotation + family detection |
| External | Email enumeration | Identical response time + generic message |
| External | OTP brute force | OTP length >= 6 + max 5 attempts + 5m expiry |
| External | Replay attack | OTP single-use + nonce check |
| Internal | Privilege escalation | RBAC guards at every endpoint |
| Internal | Audit log tampering | Append-only audit table + daily hash chain |

## Test Coverage Gate

**Required: 100% line + branch coverage for `*.service.ts` + `*.guard.ts` files.**

CI fails if coverage < 100% for any file in this module.

## SENSTIVE FILES

- `auth.service.ts` — Core login/register/verify logic
- `password.service.ts` — bcrypt/argon2 wrapper
- `otp.service.ts` — OTP generation, validation, rate-limit
- `jwt.strategy.ts` — JWT token validation
- `refresh-token.service.ts` — Refresh rotation + family detection
- `rbac.guard.ts` — Role-based access guards
- `account-lockout.service.ts` — Lockout counter + expiry

## FURTHER READING

- `docs/security-zones.md` — Security zones overview
- `VIBE_CODE.md` — Team coding standards
- `CONTRIBUTING-RULES.md` — PR process
- ECC skill `error-handling` — Use `DomainError` subclasses, never `HttpException` directly
- ECC skill `security-review` — OWASP Top 10 checklist
