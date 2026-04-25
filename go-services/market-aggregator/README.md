# market-aggregator

Scaffold cho Phase 5:

- input: `trade.executed` / `market.ticker_updated` qua event bus
- output: ticker/OHLCV read model + Redis cache
- compatibility: giữ nguyên REST facade và Socket.IO payload contract phía NestJS

Hiện tại service scaffold để chuẩn bị wiring CI/CD + deploy shadow.
