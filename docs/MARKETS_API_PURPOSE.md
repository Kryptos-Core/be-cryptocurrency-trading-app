# Markets API Purpose

Markets module manages trading pairs and market data endpoints (ticker, order book, trades, OHLCV).

## Key responsibilities

- Manage market pair metadata
- Serve pair lookup by ID and symbol
- Serve ticker and chart data
- Support admin CRUD with RBAC/permissions

## Main routes (with global prefix)

- GET /api/v1/markets
- GET /api/v1/markets/active
- GET /api/v1/markets/tickers/all
- GET /api/v1/markets/symbol/:symbol
- GET /api/v1/markets/symbol/:symbol/ticker
- GET /api/v1/markets/symbol/:symbol/orderbook
- GET /api/v1/markets/symbol/:symbol/trades
- GET /api/v1/markets/:id
- GET /api/v1/markets/:id/ticker
- GET /api/v1/markets/:id/orderbook
- GET /api/v1/markets/:id/ohlcv
- GET /api/v1/markets/:id/trades
- POST /api/v1/markets (admin)
- PATCH /api/v1/markets/:id (admin)
- DELETE /api/v1/markets/:id (admin)

## Data source note

Ticker/OHLCV are fetched on-demand from Binance integration path in current project.
