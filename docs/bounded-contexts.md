# Bounded contexts (BE)

| Context | Nest module | Owns (examples) | Public surface |
|--------|-------------|-----------------|----------------|
| Identity & access | `auth`, `users` | users, sessions, tokens | DTOs, use-cases, ports |
| Markets | `markets` | market pairs, tickers (cache) | `MARKET_REPOSITORY`, queries |
| Trading & matching | `orders`, `matching` | orders, order book, trades | use-cases, queue contracts |
| Wallets & ledger | `wallets` | balances, ledger entries | wallet ports |
| Blockchain | `blockchain` | linked wallets, on-chain tx, withdrawals | public barrel |
| Treasury | `treasury` | main wallets, operations | treasury ports |
| Payments & fiat | `deposits`, `payment-config` | fiat deposits, method configs | use-cases |
| Platform config | `system-config`, `currencies`, `exchange-rate` | runtime settings, rates | repositories / use-cases |
| Notifications | `notifications` | user notifications | repository port |
| Adapters | `binance-rest`, `price-oracle`, `redis` | external I/O only | **no domain** — infrastructure |

**ACL rule:** No `modules/A` importing `modules/B/application/**/*.ts` services. Prefer ports, DTOs, or integration events from outbox relay.
