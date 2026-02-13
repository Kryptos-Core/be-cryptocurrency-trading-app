# Seed data

Clear DB (trading tables + users) và import lại dữ liệu từ file JSON.

## Chạy

```bash
# Clear toàn bộ (wallet_ledger, wallets, orders, trades, price_alerts, users, market_pairs, currencies) rồi seed lại
npm run db:reset

# Hoặc chỉ seed (cùng thao tác clear + seed)
npm run db:seed
```

Cần có `.env` với `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`.

**Sau khi chạy seed:** restart backend (`npm run start:dev` hoặc `npm run dev`) để price feed load lại danh sách cặp. Nến/chart lấy on-demand từ Price Oracle (Binance/Uniswap), không seed OHLCV vào DB.

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

Có thể thêm/sửa bản ghi trong các file JSON rồi chạy lại `npm run db:seed` để import.

**Lưu ý:** OHLCV không còn được seed (bảng `ohlcv` đã bỏ). Chart/nến lấy on-demand từ Price Oracle (Binance/Uniswap). File `data/ohlcv.json` (nếu còn) không được dùng trong seed.
