# Seed data

Clear DB (trading tables) và import lại dữ liệu từ file JSON. Định dạng dữ liệu **theo chuẩn WebSocket** (OHLC = `OHLCMessage`, market = symbol pair) để dễ import vào DB.

## Chạy

```bash
# Clear toàn bộ (ohlcv, trades, orders, price_alerts, market_pairs, currencies) rồi seed lại
npm run db:reset

# Hoặc chỉ seed (cùng thao tác clear + seed)
npm run db:seed
```

Cần có `.env` với `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`.

**Sau khi chạy seed:** restart backend (`npm run start:dev` hoặc `npm run dev`) để Binance price feed load lại danh sách cặp từ DB và bắt đầu đẩy giá realtime (nến biểu đồ mới cập nhật).

## Cấu trúc dữ liệu

### `data/currencies.json`

Danh sách currency cho bảng `currencies`:

```json
[
  { "symbol": "USDT", "name": "Tether", "precision_scale": 6, "min_withdraw": "10", "is_tradable": true, "is_active": true }
]
```

### `data/market-pairs.json`

Danh sách cặp market, dùng `base_symbol` / `quote_symbol` để resolve sang `currency_id` sau khi seed currencies:

```json
[
  { "base_symbol": "BTC", "quote_symbol": "USDT", "symbol": "BTC/USDT", "price_scale": 2, "amount_scale": 6, "min_order_amount": "0.0001" }
]
```

### `data/ohlcv.json`

**Chuẩn WebSocket (OHLCMessage):** dùng `symbol` (pair) và `interval` giống message OHLC từ WS, script sẽ resolve `symbol` → `pair_id` khi import.

```json
[
  {
    "symbol": "BTC/USDT",
    "interval": "1m",
    "open_time": 1739020800000,
    "close_time": 1739020860000,
    "open": "69400.00",
    "high": "69480.00",
    "low": "69380.00",
    "close": "69450.00",
    "volume": "12.5",
    "quote_volume": "868125.00",
    "trades_count": 150,
    "is_closed": true
  }
]
```

- `open_time` / `close_time`: Unix timestamp **milli giây** (như WebSocket).
- `interval`: `1m` | `5m` | `15m` | `1h` | `4h` | `1d`.

Có thể thêm/sửa bản ghi trong các file JSON rồi chạy lại `npm run db:seed` để import.
