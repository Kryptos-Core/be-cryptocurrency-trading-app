# Ubiquitous language (trading)

| Term | Meaning |
|------|---------|
| Market pair | Tradable pair base/quote (e.g. BTC/USDT) |
| Order | User intent to buy/sell on a pair |
| Trade | Executed match between two orders |
| Ledger entry | Immutable wallet balance movement |
| Outbox row | Durable integration event waiting for relay |
| Projection | Read-optimized row derived from integration events |
| Integration event | Payload trong `integration_outbox`; relay áp dụng đồng bộ (read model / notification) rồi mới `published_at` |
| Unit of Work (UoW) | Khối transaction ứng dụng bọc nhiều thao tác persistence + outbox append |
| Application bus | `@nestjs/cqrs` — điều phối command/query handler trong Nest |
