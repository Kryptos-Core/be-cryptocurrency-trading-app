# Mục đích của Markets API

Module Markets quản lý các cặp giao dịch và các endpoint dữ liệu thị trường (ticker, sổ lệnh, giao dịch, OHLCV).

## Trách nhiệm chính

- Quản lý metadata của các cặp thị trường
- Cung cấp tính năng tra cứu cặp giao dịch theo ID và ký hiệu (symbol)
- Cung cấp dữ liệu ticker và dữ liệu biểu đồ
- Hỗ trợ các thao tác CRUD cho quản trị viên với phân quyền RBAC

## Các route chính (có tiền tố global)

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

## Lưu ý về nguồn dữ liệu

Ticker/OHLCV được lấy theo yêu cầu (on-demand) từ việc tích hợp với Binance trong dự án hiện tại.
