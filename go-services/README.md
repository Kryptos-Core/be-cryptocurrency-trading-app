# Go services (scaffold)

Các service Go được tách theo clean architecture để phục vụ roadmap multi-database + TS/Go:

- `market-aggregator`: consume integration events và build ticker/OHLCV read side.
- `matching-engine`: shadow matching runner (không mutate production balances/trades).
- `public-ws-gateway`: public market WS fan-out (fallback NestJS `/trading` vẫn giữ).

> Trạng thái: scaffold chạy local cho mục đích tích hợp dần; chưa bật production traffic mặc định.
