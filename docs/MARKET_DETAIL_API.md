# API Chi tiết Market (Trang detail & tab Thị trường)

Docs: endpoint, response type, cách hiển thị và xử lý lỗi cho **tab Thị trường**, **trang chi tiết market** (giá, 24h, sổ lệnh, biểu đồ).

---

## Các endpoint cần gọi

| Nội dung hiển thị        | Method | Endpoint | Ghi chú |
|--------------------------|--------|----------|--------|
| **Tab Thị trường** – danh sách pair + giá, % đổi | GET | `/api/v1/markets/tickers/all` | Response `data` là **mảng** `MarketTickerDto[]`. |
| Giá gần nhất, 24h, volume | GET | `/api/v1/markets/:id/ticker` hoặc `/api/v1/markets/symbol/:symbol/ticker` | Response `data` là **một object** `MarketTickerDto`. `:id` = pair_id. |
| Sổ lệnh (BIDS/ASKS)      | GET | `/api/v1/markets/:id/order-book` hoặc `/api/v1/markets/symbol/:symbol/order-book` | Trả về `bids`, `asks` (có thể rỗng). |
| Biểu đồ nến              | GET | `/api/v1/markets/:id/ohlcv?interval=1m&range=1d` | Xem [OHLCV_CHART_RANGE_FILTER.md](./OHLCV_CHART_RANGE_FILTER.md). |

Tất cả đều cần **Authorization: Bearer &lt;token&gt;** (JWT).

**Format response chung (Response Interceptor):** Mọi API trả về:

```ts
{ success: true, data: T, timestamp: string }
```

- `GET /markets/tickers/all` → `data` là **mảng** ticker.
- `GET /markets/:id/ticker` hoặc `GET /markets/symbol/:symbol/ticker` → `data` là **một object** ticker.

---

## Giá và Ticker (Giá gần nhất, Biến động 24h, Khối lượng 24h)

- **Nguồn dữ liệu**: Ticker ưu tiên từ **trades** (giao dịch đã khớp). Khi chưa có giao dịch, backend **fallback OHLCV** (giá đóng cửa từ luồng Binance) → "Giá gần nhất" vẫn có số.
- **Biến động 24h**: Nếu đã có nến 24h trước → `change24h` / `changeAmount24h` tính từ giá 24h trước. Nếu **chưa đủ 24h data** (pair mới, server mới chạy), backend dùng **giá đóng cửa nến sớm nhất** làm mốc → vẫn trả % và số thay đổi (không còn tình trạng vài market luôn 0%).
- **Khi volume/change = 0**: Chỉ khi thật sự không có dữ liệu (ví dụ chưa có nến nào) thì mới là 0; đó là hành vi đúng.

---

## Sổ lệnh (Order book – BIDS/ASKS)

- **Nguồn dữ liệu**: Lấy từ bảng **orders** (các lệnh đang mở). Nếu chưa ai đặt lệnh, `bids` và `asks` là mảng rỗng.
- **Cách xử lý FE**: Luôn nhận `{ bids: [], asks: [] }` là hợp lệ; nên hiển thị "Chưa có lệnh" hoặc placeholder thay vì để trống không rõ lý do.
- **Query**: `limit` (optional, mặc định 20) – số mức giá mỗi bên.

---

## Biểu đồ (OHLCV)

- **Nguồn dữ liệu**: Bảng **ohlcv**, được cập nhật từ price feed (Binance). Cặp phải đang được feed (có trong danh sách pair active) thì mới có nến.
- **Nếu biểu đồ trống**: Kiểm tra (1) gọi đúng `pair_id` (hoặc symbol) cho market đang xem, (2) có gửi `interval` và tuỳ chọn `range` (ví dụ `interval=1m`, `range=1d`). Nếu backend trả `candles: []` thì có thể chưa có dữ liệu nến cho cặp/interval đó (ví dụ server mới chạy, chưa đủ thời gian tích luỹ nến).

---

## Tab Thị trường (danh sách market)

- **Endpoint**: `GET /api/v1/markets/tickers/all`. Trả về mảng ticker (mỗi phần tử có `symbol`, `pairId`, `lastPrice`, `change24h`, `changeAmount24h`, `volume24h`, …).
- **Khi tất cả hiển thị 0.00 / 0.00%**: Backend đã dùng giá từ OHLCV khi không có trades. Cache ticker được **xóa khi backend khởi động**, nên sau khi restart server, request đầu tiên sẽ lấy giá mới. Nếu vẫn toàn 0: kiểm tra (1) backend đã chạy đủ lâu để price feed ghi OHLCV, (2) FE gọi đúng `/markets/tickers/all` và map đúng các field từ response.

---

## Response cho FE – Ticker (tab Thị trường & trang detail)

### TypeScript type (FE có thể copy)

Backend response wrap: `{ success: true, data: T, timestamp: string }`. Type cho `data`:

```ts
/** Một ticker – dùng cho GET /markets/:id/ticker và mỗi phần tử của GET /markets/tickers/all */
export interface MarketTickerDto {
  symbol: string;           // e.g. "BTC/USDT"
  pairId: number;
  lastPrice: string;         // số dạng string, nhiều chữ số thập phân
  open24h: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  quoteVolume24h: string;
  change24h: string;        // % 24h, tối đa 2 chữ số thập phân, e.g. "0.52", "-0.31", "0"
  changeAmount24h: string;  // chênh lệch giá 24h (có thể nhiều chữ số thập phân)
  bestBid: string;
  bestAsk: string;
  timestamp: string;         // ISO 8601
}

// GET /markets/tickers/all → data: MarketTickerDto[]
// GET /markets/:id/ticker hoặc /markets/symbol/:symbol/ticker → data: MarketTickerDto
```

### GET /api/v1/markets/tickers/all

- **Response**: `{ success: true, data: MarketTickerDto[], timestamp: string }`.
- `data` là mảng ticker cho mọi pair active (thứ tự theo backend).

### GET /api/v1/markets/:id/ticker và GET /api/v1/markets/symbol/:symbol/ticker

- **Response**: `{ success: true, data: MarketTickerDto, timestamp: string }`.
- `data` là **một object** ticker cho pair đó (trang chi tiết).

### Bảng field (chi tiết)

| Field | Kiểu | Mô tả |
|-------|------|--------|
| `symbol` | string | Mã cặp, ví dụ `"BTC/USDT"`. |
| `pairId` | number | ID pair (dùng cho `/markets/:id/...`, `/markets/:id/ohlcv`). |
| `lastPrice` | string | Giá gần nhất. **FE:** `parseFloat(lastPrice)` khi tính toán; format hiển thị tùy pair (2–8 số thập phân). |
| `change24h` | string | Biến động 24h (%). Ví dụ `"0.52"`, `"-0.31"`, `"0"`. **FE:** so sánh bằng `parseFloat(change24h)`, không so sánh string. |
| `changeAmount24h` | string | Chênh lệch giá 24h = lastPrice − open24h. Dương = tăng, âm = giảm. Có thể nhiều chữ số thập phân (backend dùng 18). **FE:** format hiển thị (ví dụ 2–4 số) hoặc rút gọn. |
| `volume24h` | string | Khối lượng 24h (base). Hiển thị Vol; có thể rút gọn K/M. |
| `quoteVolume24h` | string | Khối lượng 24h quy quote (USDT). |
| `open24h` | string | Giá mở cửa 24h trước (hoặc nến sớm nhất khi chưa đủ 24h). |
| `high24h`, `low24h` | string | Giá cao nhất / thấp nhất 24h. |
| `bestBid`, `bestAsk` | string | Giá bid/ask tốt nhất. |
| `timestamp` | string | ISO 8601, thời điểm backend tạo response. |

### Cách hiển thị trên tab Thị trường (FE)

- **Giá hiện tại**: `lastPrice` → format số thập phân theo pair (2–8 số).
- **Tăng/giảm %**: dùng `change24h`.
  - `parseFloat(change24h) > 0` → xanh, thêm dấu `+`, ví dụ `+0.52%`.
  - `parseFloat(change24h) < 0` → đỏ, ví dụ `-0.31%`.
  - `=== 0` (hoặc parseFloat = 0) → `0.00%` (xám/trung tính).
- **Số lượng tăng/giảm**: `changeAmount24h` → format (2–4 số) hoặc rút gọn; dương/âm tương ứng.
- **Vol**: `volume24h` → "Vol: X" hoặc "Vol: 1.2K", "1.5M".
- **Lưu ý**: Mọi giá/volume đều là **string**; FE cần `parseFloat(...)` khi so sánh hoặc format số. Không so sánh hai string số (e.g. `"0"` vs `"0.00"`).

### Ví dụ response (nội dung `data`)

**Một ticker (GET /markets/:id/ticker):**

```json
{
  "symbol": "BTC/USDT",
  "pairId": 23,
  "lastPrice": "70450.12",
  "change24h": "0.52",
  "changeAmount24h": "365.24",
  "volume24h": "1250.5",
  "quoteVolume24h": "88123456.00",
  "open24h": "70084.88",
  "high24h": "70600.00",
  "low24h": "69800.00",
  "bestBid": "70449.00",
  "bestAsk": "70451.00",
  "timestamp": "2026-02-08T12:00:00.000Z"
}
```

**Mảng tickers (GET /markets/tickers/all):** `data` là mảng các object như trên.

---

## Tóm tắt sự cố & cách xử lý

| Vấn đề | Nguyên nhân | Cách xử lý |
|--------|-------------|------------|
| Tab Thị trường / list toàn 0.00 | Cache ticker cũ hoặc chưa có trades. | Backend fallback OHLCV và xóa cache lúc khởi động. Restart backend, đợi vài giây cho price feed ghi nến rồi mở lại tab. |
| Giá gần nhất = 0 (trang detail) | Trước đây chỉ lấy từ trades; giờ backend đã fallback OHLCV. | Gọi lại ticker sau khi deploy backend mới; không cần đổi cách gọi. |
| Một vài market luôn 0% biến động | Trước đây khi không có nến 24h trước thì open = last → 0%. | Backend đã dùng **giá nến sớm nhất** làm mốc khi chưa đủ 24h; FE chỉ cần map đúng `change24h` / `changeAmount24h` từ response. |
| Sổ lệnh trống | Chưa có lệnh mua/bán nào. | Hiển thị "Chưa có lệnh" khi `bids.length === 0 && asks.length === 0`. |
| Biểu đồ trống | Chưa có dữ liệu nến hoặc gọi sai pair_id/interval. | Gọi `GET /markets/:id/ohlcv?interval=1m&range=1d` đúng `id`; kiểm tra `data.candles` có phần tử hay không. |

---

## Checklist FE (cần sửa / kiểm tra)

- [ ] Dùng đúng **response wrap**: `response.data` mới là mảng ticker (tickers/all) hoặc object ticker (ticker by id/symbol); không dùng `response` trực tiếp như mảng/object.
- [ ] **Type**: Khai báo `data: MarketTickerDto` hoặc `MarketTickerDto[]` theo endpoint; tất cả field giá/volume là **string**.
- [ ] **So sánh số**: Dùng `parseFloat(change24h)` (và tương tự cho giá/volume) khi so sánh hoặc format; không so sánh string (e.g. `change24h > "0"`).
- [ ] **Hiển thị %**: Dựa vào `parseFloat(change24h)` để quyết định màu (xanh/đỏ) và dấu (+/-); format ví dụ `+0.52%`, `-0.31%`, `0.00%`.
- [ ] **Trang detail**: Gọi `GET /markets/:id/ticker` (hoặc by symbol) và hiển thị đủ lastPrice, change24h, changeAmount24h, volume24h từ `data`.
