# Currencies API Purpose

Currencies module is the master catalog of tradable assets.
Other modules (markets, wallets, orders) reference currency IDs from here.

## Key responsibilities

- Manage currency metadata (symbol, name, precision, flags)
- Expose active and tradable lists for UI and validation
- Support admin CRUD with RBAC/permissions

## Main routes (with global prefix)

- GET /api/v1/currencies
- GET /api/v1/currencies/active
- GET /api/v1/currencies/tradable
- GET /api/v1/currencies/:id
- GET /api/v1/currencies/symbol/:symbol
- POST /api/v1/currencies (admin)
- PATCH /api/v1/currencies/:id (admin)
- DELETE /api/v1/currencies/:id (admin)

## Why this module matters

- Markets uses base/quote currency from this catalog.
- Wallets and ledger map balances by currency ID.
- Trading validation depends on currency activity/tradability flags.
