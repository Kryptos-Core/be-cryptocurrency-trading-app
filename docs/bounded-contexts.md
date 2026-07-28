# Bounded contexts (BE)

> Last reviewed: 2026-07-28 — verified against `src/modules/` (25+ modules).

| Context | Nest module | Owns (examples) | Public surface |
|--------|-------------|-----------------|----------------|
| Identity & access | `auth`, `users` | users, sessions, tokens | DTOs, use-cases, ports |
| Markets | `markets` | market pairs, tickers (cache) | `MARKET_REPOSITORY`, queries |
| Trading & matching | `orders`, `matching`, `trading` | orders, order book, trades | use-cases, queue contracts |
| Wallets & ledger | `wallets`, `managed-wallets` | balances, ledger entries, hot wallet UI | wallet ports |
| Blockchain | `blockchain`, `binance-rest`, `binance-proxy`, `price-oracle`, `exchange`, `user-binance-credentials` | linked wallets, on-chain tx, withdrawals, per-user Binance API keys | public barrel + AES-256-GCM credential storage |
| Treasury | `treasury`, `treasury-e2e-config` | main wallets, operations, E2E config DB+UI | treasury ports, admin UI |
| Payments & fiat | `deposits`, `payment-config` | fiat deposits, method configs | use-cases |
| Platform config | `system-config`, `currencies`, `exchange-rate` | runtime settings, rates | repositories / use-cases |
| Notifications | `notifications` | user notifications, FCM tokens | repository port |
| Operations | `market-maker`, `metadata`, `dashboard` | market maker config, app metadata, ops dashboard | admin controllers |
| Adapters | `redis` | external I/O only (Redis singleton) | **no domain** — infrastructure |
| Health | `src/health` | `/api/v1/health`, `/api/v1/health/ready` | — |

**ACL rule:** Tránh `modules/A` import trực tiếp `modules/B/application/**/*.ts` (service/use-case). Ưu tiên **port**, **DTO**, hoặc **integration event** (relay từ bảng `integration_outbox`). Kiểm tra cục bộ: `npm run lint:boundaries` (xem [ARCHITECTURE.md](ARCHITECTURE.md)).

**Special sensitive zones:** `matching`, `orders`, `treasury`, `wallets`, `blockchain` — xem [security-zones.md](security-zones.md) cho quy trình review + risk-note.
