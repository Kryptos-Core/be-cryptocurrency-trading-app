# OHLCV Chart API – Bộ lọc theo khoảng thời gian (Range Filter)

Cách gọi API lấy dữ liệu nến (candlestick) và bộ lọc theo 1 ngày, 1 tháng, 3 tháng, 1 năm, 5 năm.

---

## Endpoint

```
GET /api/v1/markets/:id/ohlcv
```

- **`:id`**: `pair_id` của market (ví dụ: 23 cho BTC/USDT).
- Cần gửi kèm **Authorization** (Bearer token) nếu API yêu cầu auth.

---

## Query parameters

| Tham số    | Bắt buộc | Mặc định | Mô tả |
|------------|----------|----------|--------|
| `interval` | Không    | `1h`     | Khung thời gian mỗi nến: `1m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `12h`, `1d`, `1w`. |
| `limit`    | Không    | `100`    | Số nến tối đa trả về. Khi dùng `range`, tối đa 500. |
| **`range`** | Không   | —        | **Bộ lọc theo khoảng thời gian**: chỉ lấy nến trong khoảng từ (now − range) đến now. |

---

## Bộ lọc `range` (dành cho chart)

Khi có `range`, backend chỉ trả về các nến có `open_time >= (thời điểm hiện tại − range)`.

| Giá trị `range` | Ý nghĩa   | Khoảng lùi (xấp xỉ) |
|------------------|-----------|----------------------|
| `1d`             | 1 ngày    | 24 giờ               |
| `1M`             | 1 tháng   | 30 ngày              |
| `3M`             | 3 tháng   | 90 ngày              |
| `1y`             | 1 năm     | 365 ngày             |
| `5y`             | 5 năm     | 1.825 ngày           |

- **Chú ý**: Dùng đúng chữ hoa/thường: `1d`, `1M`, `3M`, `1y`, `5y` (chữ M viết hoa cho tháng).
- Nếu gửi `range` khác các giá trị trên, backend bỏ qua `range` và trả về theo `limit` như cũ.

---

## Ví dụ gọi API (cho FE)

**Chart 1 ngày, nến 1 phút:**
```
GET /api/v1/markets/23/ohlcv?interval=1m&range=1d
```

**Chart 1 tháng, nến 1 giờ:**
```
GET /api/v1/markets/23/ohlcv?interval=1h&range=1M
```

**Chart 3 tháng, nến 4 giờ:**
```
GET /api/v1/markets/23/ohlcv?interval=4h&range=3M
```

**Chart 1 năm, nến 1 ngày:**
```
GET /api/v1/markets/23/ohlcv?interval=1d&range=1y
```

**Chart 5 năm, nến 1 ngày:**
```
GET /api/v1/markets/23/ohlcv?interval=1d&range=5y
```

**Không dùng range (hành vi cũ, chỉ dùng limit):**
```
GET /api/v1/markets/23/ohlcv?interval=1h&limit=100
```

---

## Response

```json
{
  "success": true,
  "data": {
    "pair_id": 23,
    "interval": "1h",
    "interval_sec": 3600,
    "range": "1d",
    "candles": [
      {
        "pair_id": 23,
        "interval_sec": 3600,
        "open_time": "2026-02-08T10:00:00.000Z",
        "open": "70400.00",
        "high": "70500.00",
        "low": "70350.00",
        "close": "70480.00",
        "volume": "125.5"
      }
    ]
  },
  "timestamp": "2026-02-08T12:00:00.000Z"
}
```

- `range`: có giá trị khi request có query `range` (ví dụ `"1d"`), nếu không dùng range thì `null`.
- `candles`: mảng theo thứ tự thời gian tăng dần (open_time cũ → mới).
- Các trường số (`open`, `high`, `low`, `close`, `volume`) là chuỗi để giữ độ chính xác.

---

## Lỗi thường gặp

| HTTP | Ý nghĩa |
|------|---------|
| 404  | Không tìm thấy market với `id` tương ứng. |
| 400  | `interval` không hợp lệ (không nằm trong danh sách hỗ trợ). |
