# Mục Đích Của API Markets

## Tổng Quan

API Markets quản lý các trading pairs (cặp giao dịch) như BTC/USDT, ETH/USDT, ETH/BTC, v.v. Module này là **trung tâm của trading platform**, cung cấp thông tin về market pairs, ticker data (24h statistics), order book, và recent trades. Markets API kết nối Currencies với Trading module, cho phép users giao dịch giữa các loại tiền ảo.

---

## 1. Quản Lý Market Pairs

### Chức Năng Chính

- **Lưu trữ thông tin** các trading pairs:
  - `symbol`: Mã pair (BTC/USDT, ETH/USDT, ...)
  - `base_currency_id`: Currency được trade (BTC, ETH, ...)
  - `quote_currency_id`: Currency dùng để định giá (USDT, BTC, ...)
  - `price_scale`: Số chữ số thập phân cho giá (0-18)
  - `amount_scale`: Số chữ số thập phân cho số lượng (0-18)
  - `min_order_amount`: Số lượng tối thiểu cho một order
  - `maker_fee_rate`: Phí cho maker (người tạo order)
  - `taker_fee_rate`: Phí cho taker (người match order)
  - `is_active`: Trạng thái active/inactive

### CRUD Operations

- **Create**: Tạo market pair mới (BTC/USDT, ETH/USDT, ...)
- **Read**: Xem danh sách, chi tiết market pair
- **Update**: Cập nhật thông tin market pair (fee rates, scales, ...)
- **Delete**: Vô hiệu hóa market pair (soft delete - set `is_active = false`)

### Filtering & Querying

- Lọc theo trạng thái: `active` / `inactive`
- Pagination cho danh sách lớn
- Tìm kiếm theo `symbol` hoặc `ID`
- Lấy ticker data (24h statistics)
- Lấy order book (bids/asks)
- Lấy recent trades

---

## 2. Cấu Hình Cho Các Module Khác

Markets được sử dụng như **trung tâm kết nối** giữa Currencies và Trading:

### 2.1 Trading (Giao Dịch)

**Mối quan hệ:**
```
User muốn trade BTC/USDT
→ Cần market pair BTC/USDT
→ Pair này định nghĩa base currency (BTC) và quote currency (USDT)
→ Pair cung cấp fee rates, price/amount scales
```

**Chức năng:**
- Orders tham chiếu đến market pair
- Trades được tạo từ market pair
- Fee rates được lấy từ market pair
- Price/amount scales được dùng để format số

**Ví dụ:**
```typescript
// User tạo order BUY BTC/USDT
const pair = await marketsService.findOne(1); // BTC/USDT

// Get pair info
const order = {
  user_id: 1,
  pair_id: pair.pair_id,
  side: 'BUY',
  price: '50000.00',  // Format theo pair.price_scale (2 decimals)
  amount: '0.123456', // Format theo pair.amount_scale (6 decimals)
  maker_fee_rate: pair.maker_fee_rate, // 0.001 = 0.1%
  taker_fee_rate: pair.taker_fee_rate
};

// Validation
if (!pair.is_active) {
  throw new Error('Market pair is not active');
}

if (amount < parseFloat(pair.min_order_amount)) {
  throw new Error(`Amount must be >= ${pair.min_order_amount}`);
}
```

### 2.2 Order Book (Sổ Lệnh)

**Mối quan hệ:**
```
Order Book hiển thị bids (mua) và asks (bán) cho một market pair
→ Lấy từ Orders table với pair_id
→ Aggregated theo price level
```

**Chức năng:**
- Hiển thị depth chart (biểu đồ độ sâu thị trường)
- Hiển thị best bid/ask prices
- Tính toán spread (chênh lệch giá)
- Real-time order book updates

**Ví dụ:**
```typescript
// Get order book cho BTC/USDT
const orderBook = await marketsService.getOrderBook(1, 20);

// Bids (mua) - sorted DESC
orderBook.bids = [
  { price: '50000.00', amount: '1.5', orders: 3 },
  { price: '49999.00', amount: '2.0', orders: 5 }
];

// Asks (bán) - sorted ASC
orderBook.asks = [
  { price: '50001.00', amount: '0.8', orders: 2 },
  { price: '50002.00', amount: '1.2', orders: 4 }
];

// Calculate spread
const spread = parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price);
// spread = 50001.00 - 50000.00 = 1.00 USDT
```

### 2.3 Ticker Data (Thống Kê 24h)

**Mối quan hệ:**
```
Ticker data cung cấp 24h statistics cho market pair
→ Lấy từ Trades table với pair_id
→ Tính toán high/low/volume/change
```

**Chức năng:**
- Hiển thị last price, 24h high/low
- Hiển thị 24h volume (base và quote currency)
- Hiển thị 24h price change (% và amount)
- Hiển thị best bid/ask từ order book

**Ví dụ:**
```typescript
// Get ticker cho BTC/USDT
const ticker = await marketsService.getTicker(1);

// Display trên UI
console.log(`BTC/USDT: $${ticker.lastPrice}`);
console.log(`24h Change: ${ticker.change24h}%`);
console.log(`24h Volume: ${ticker.volume24h} BTC`);
console.log(`24h High: $${ticker.high24h}`);
console.log(`24h Low: $${ticker.low24h}`);
```

### 2.4 Recent Trades (Giao Dịch Gần Đây)

**Mối quan hệ:**
```
Recent trades hiển thị các trades mới nhất cho market pair
→ Lấy từ Trades table với pair_id
→ Sorted by created_at DESC
```

**Chức năng:**
- Hiển thị trade history
- Hiển thị price movement
- Real-time trade updates
- Market activity indicator

**Ví dụ:**
```typescript
// Get recent trades cho BTC/USDT
const trades = await marketsService.getRecentTrades(1, 50);

// Display trên UI
trades.forEach(trade => {
  console.log(`${trade.side}: ${trade.amount} BTC @ $${trade.price}`);
});
```

---

## 3. Use Cases Thực Tế

### 3.1 Frontend Hiển Thị

#### Lấy danh sách market pairs để hiển thị trading interface

```typescript
// API Call
GET /markets/active

// Response
{
  "success": true,
  "data": [
    { 
      "pair_id": 1, 
      "symbol": "BTC/USDT",
      "base_currency": { "symbol": "BTC", "name": "Bitcoin" },
      "quote_currency": { "symbol": "USDT", "name": "Tether" }
    },
    { 
      "pair_id": 2, 
      "symbol": "ETH/USDT",
      "base_currency": { "symbol": "ETH", "name": "Ethereum" },
      "quote_currency": { "symbol": "USDT", "name": "Tether" }
    }
  ]
}

// Frontend: Hiển thị market selector
<select>
  <option value="1">BTC/USDT</option>
  <option value="2">ETH/USDT</option>
  <option value="3">BNB/USDT</option>
</select>
```

#### Lấy ticker data để hiển thị market overview

```typescript
// API Call
GET /markets/tickers/all

// Response
{
  "success": true,
  "data": [
    {
      "symbol": "BTC/USDT",
      "lastPrice": "50000.00",
      "change24h": "0.02",
      "volume24h": "100.5",
      "high24h": "51000.00",
      "low24h": "49000.00"
    },
    {
      "symbol": "ETH/USDT",
      "lastPrice": "3000.00",
      "change24h": "-0.01",
      "volume24h": "500.2",
      "high24h": "3100.00",
      "low24h": "2900.00"
    }
  ]
}

// Frontend: Hiển thị market overview table
<table>
  <tr>
    <td>BTC/USDT</td>
    <td>$50,000.00</td>
    <td class="positive">+2.00%</td>
    <td>100.5 BTC</td>
  </tr>
  <tr>
    <td>ETH/USDT</td>
    <td>$3,000.00</td>
    <td class="negative">-1.00%</td>
    <td>500.2 ETH</td>
  </tr>
</table>
```

#### Lấy order book để hiển thị depth chart

```typescript
// API Call
GET /markets/1/orderbook?limit=20

// Response
{
  "success": true,
  "data": {
    "symbol": "BTC/USDT",
    "bids": [
      { "price": "50000.00", "amount": "1.5", "orders": 3 },
      { "price": "49999.00", "amount": "2.0", "orders": 5 }
    ],
    "asks": [
      { "price": "50001.00", "amount": "0.8", "orders": 2 },
      { "price": "50002.00", "amount": "1.2", "orders": 4 }
    ]
  }
}

// Frontend: Hiển thị depth chart
// Bids (màu xanh) - từ trên xuống
// Asks (màu đỏ) - từ dưới lên
// Spread line ở giữa
```

#### Lấy recent trades để hiển thị trade history

```typescript
// API Call
GET /markets/1/trades?limit=50

// Response
{
  "success": true,
  "data": [
    {
      "trade_id": 1001,
      "price": "50000.00",
      "amount": "0.1",
      "side": "BUY",
      "created_at": "2024-01-22T10:30:00.000Z"
    },
    {
      "trade_id": 1000,
      "price": "49999.00",
      "amount": "0.2",
      "side": "SELL",
      "created_at": "2024-01-22T10:29:00.000Z"
    }
  ]
}

// Frontend: Hiển thị trade list
trades.forEach(trade => {
  const color = trade.side === 'BUY' ? 'green' : 'red';
  displayTrade(trade.price, trade.amount, color);
});
```

### 3.2 Backend Validation

#### Khi user tạo order

```typescript
async createOrder(userId: number, pairId: number, price: string, amount: string) {
  // 1. Get market pair
  const pair = await marketsService.findOne(pairId);
  
  // 2. Validation
  if (!pair.is_active) {
    throw new BadRequestException('Market pair is not active');
  }
  
  // 3. Check minimum order amount
  if (parseFloat(amount) < parseFloat(pair.min_order_amount)) {
    throw new BadRequestException(
      `Amount must be >= ${pair.min_order_amount}`
    );
  }
  
  // 4. Format số theo scales
  const formattedPrice = parseFloat(price).toFixed(pair.price_scale);
  const formattedAmount = parseFloat(amount).toFixed(pair.amount_scale);
  
  // 5. Get fee rates từ pair
  const makerFeeRate = parseFloat(pair.maker_fee_rate);
  const takerFeeRate = parseFloat(pair.taker_fee_rate);
  
  // 6. Create order
  return this.ordersService.create({
    user_id: userId,
    pair_id: pairId,
    price: formattedPrice,
    amount: formattedAmount,
    maker_fee_rate: makerFeeRate,
    taker_fee_rate: takerFeeRate
  });
}
```

#### Khi user xem market detail

```typescript
async getMarketDetail(symbol: string) {
  // 1. Get market pair
  const pair = await marketsService.findBySymbol(symbol);
  
  if (!pair) {
    throw new NotFoundException(`Market pair ${symbol} not found`);
  }
  
  // 2. Get ticker data
  const ticker = await marketsService.getTicker(pair.pair_id);
  
  // 3. Get order book
  const orderBook = await marketsService.getOrderBook(pair.pair_id, 20);
  
  // 4. Get recent trades
  const trades = await marketsService.getRecentTrades(pair.pair_id, 50);
  
  // 5. Return combined data
  return {
    pair,
    ticker,
    orderBook,
    trades
  };
}
```

---

## 4. Các Endpoint Và Mục Đích

| Endpoint | Method | Mục Đích | Use Case |
|----------|--------|----------|----------|
| `/markets` | GET | Lấy danh sách với pagination | Admin panel, market list với filter |
| `/markets/active` | GET | Lấy active pairs (cached) | Trading interface, market selector |
| `/markets/:id` | GET | Lấy chi tiết pair theo ID | Market detail page, validation |
| `/markets/symbol/:symbol` | GET | Tìm pair theo symbol | Quick lookup, validation |
| `/markets/:id/ticker` | GET | Lấy 24h ticker theo ID | Market overview, price display |
| `/markets/symbol/:symbol/ticker` | GET | Lấy 24h ticker theo symbol | Market overview với symbol |
| `/markets/tickers/all` | GET | Lấy tất cả tickers (cached) | Market overview table, dashboard |
| `/markets/:id/orderbook` | GET | Lấy order book theo ID | Depth chart, best bid/ask |
| `/markets/symbol/:symbol/orderbook` | GET | Lấy order book theo symbol | Depth chart với symbol |
| `/markets/:id/trades` | GET | Lấy recent trades theo ID | Trade history, market activity |
| `/markets/symbol/:symbol/trades` | GET | Lấy recent trades theo symbol | Trade history với symbol |
| `/markets` | POST | Tạo market pair mới | Admin thêm pair mới |
| `/markets/:id` | PATCH | Cập nhật market pair | Admin cập nhật fee rates, scales |
| `/markets/:id` | DELETE | Vô hiệu hóa market pair | Admin soft delete pair |

### Chi Tiết Endpoints

#### GET /markets
**Mục đích:** Lấy danh sách market pairs với pagination và filtering

**Query Parameters:**
- `page` (optional, default: 1): Số trang
- `limit` (optional, default: 10): Số items/trang
- `includeInactive` (optional, default: false): Bao gồm inactive pairs

**Use Cases:**
- Admin panel: Xem tất cả market pairs
- Market list với filter: Lọc theo active/inactive
- Pagination cho danh sách lớn

#### GET /markets/active
**Mục đích:** Lấy danh sách active market pairs (cached trong Redis, TTL: 5 phút)

**Use Cases:**
- Trading interface: Hiển thị markets có thể trade
- Market selector: Dropdown chọn market
- Market list: Hiển thị danh sách markets active

#### GET /markets/:id
**Mục đích:** Lấy chi tiết market pair theo ID

**Use Cases:**
- Market detail page: Hiển thị thông tin chi tiết pair
- Validation: Check pair info trước khi tạo order
- Admin panel: Xem chi tiết pair

#### GET /markets/symbol/:symbol
**Mục đích:** Tìm market pair theo symbol (BTC/USDT, ETH/USDT, ...)

**Lưu ý:** Symbol có dấu `/` phải được URL encode (`BTC/USDT` → `BTC%2FUSDT`)

**Use Cases:**
- Quick lookup: Tìm pair nhanh bằng symbol
- Validation: Check pair exists trước khi tạo order
- API integration: External API trả về symbol, cần lookup pair_id

#### GET /markets/:id/ticker
**Mục đích:** Lấy 24h market statistics (ticker) cho trading pair

**Use Cases:**
- Market overview: Hiển thị last price, 24h change, volume
- Price display: Hiển thị giá hiện tại
- Market analysis: Phân tích biến động giá 24h

**Cache:** TTL 1 phút (ticker data không thay đổi quá nhanh)

#### GET /markets/tickers/all
**Mục đích:** Lấy 24h statistics cho tất cả active market pairs (cached)

**Use Cases:**
- Market overview table: Hiển thị tất cả markets với ticker data
- Dashboard: Overview của toàn bộ markets
- Market comparison: So sánh performance giữa các markets

**Cache:** TTL 1 phút

#### GET /markets/:id/orderbook
**Mục đích:** Lấy order book (bids và asks) cho market pair

**Query Parameters:**
- `limit` (optional, default: 20): Số price levels

**Use Cases:**
- Depth chart: Hiển thị biểu đồ độ sâu thị trường
- Best bid/ask: Hiển thị giá mua/bán tốt nhất
- Spread calculation: Tính toán chênh lệch giá
- Market depth analysis: Phân tích độ sâu thị trường

**Cache:** TTL 10 giây (order book thay đổi thường xuyên)

#### GET /markets/:id/trades
**Mục đích:** Lấy recent trades cho market pair

**Query Parameters:**
- `limit` (optional, default: 50): Số trades

**Use Cases:**
- Trade history: Hiển thị lịch sử giao dịch
- Market activity: Hiển thị hoạt động thị trường
- Price movement: Theo dõi biến động giá
- Real-time updates: Cập nhật trades mới nhất

**Cache:** TTL 5 giây (trades update thường xuyên)

#### POST /markets
**Mục đích:** Tạo market pair mới (Admin only)

**Use Cases:**
- Admin thêm market pair mới vào hệ thống
- Onboarding market mới từ exchange
- Tạo cross pairs (ETH/BTC, ALT/BTC)

**Validation:**
- Base và quote currencies phải tồn tại và `is_tradable = true`, `is_active = true`
- Base và quote currencies không được giống nhau
- Market pair với base/quote combination phải unique
- Symbol phải unique (nếu provided)

#### PATCH /markets/:id
**Mục đích:** Cập nhật market pair (Admin only)

**Use Cases:**
- Update fee rates: Thay đổi maker/taker fee
- Update scales: Thay đổi price/amount scales
- Update min order amount: Thay đổi số lượng tối thiểu
- Enable/disable pair: Set `is_active`

#### DELETE /markets/:id
**Mục đích:** Vô hiệu hóa market pair (soft delete)

**Use Cases:**
- Disable market pair không còn sử dụng
- Temporary disable pair để maintenance
- Remove pair khỏi trading interface

---

## 5. Ví Dụ Luồng Sử Dụng

### 5.1 User Muốn Xem Market Overview

```
1. Frontend gọi API:
   GET /markets/tickers/all

2. Response trả về ticker data cho tất cả markets:
   [
     {
       "symbol": "BTC/USDT",
       "lastPrice": "50000.00",
       "change24h": "0.02",
       "volume24h": "100.5"
     },
     {
       "symbol": "ETH/USDT",
       "lastPrice": "3000.00",
       "change24h": "-0.01",
       "volume24h": "500.2"
     }
   ]

3. Frontend hiển thị market overview table:
   - Symbol
   - Last Price
   - 24h Change (màu xanh/đỏ)
   - 24h Volume
   - 24h High/Low
```

### 5.2 User Muốn Trade BTC/USDT

```
1. User chọn market: BTC/USDT

2. Frontend gọi API để lấy pair info:
   GET /markets/symbol/BTC%2FUSDT

3. Response:
   {
     "pair_id": 1,
     "symbol": "BTC/USDT",
     "price_scale": 2,
     "amount_scale": 6,
     "min_order_amount": "0.0001",
     "maker_fee_rate": "0.00100000",
     "taker_fee_rate": "0.00100000"
   }

4. Frontend validation:
   - Input price: Format theo price_scale (2 decimals)
   - Input amount: Format theo amount_scale (6 decimals)
   - Check: amount >= min_order_amount (0.0001)

5. User tạo order:
   POST /orders
   {
     "pair_id": 1,
     "side": "BUY",
     "price": "50000.00",
     "amount": "0.123456"
   }

6. Backend validation:
   - Check pair.is_active? (Pass)
   - Check amount >= pair.min_order_amount? (Pass)
   - Create order (Success)
```

### 5.3 User Muốn Xem Order Book

```
1. User chọn market: BTC/USDT

2. Frontend gọi API:
   GET /markets/1/orderbook?limit=20

3. Response:
   {
     "bids": [
       { "price": "50000.00", "amount": "1.5", "orders": 3 },
       { "price": "49999.00", "amount": "2.0", "orders": 5 }
     ],
     "asks": [
       { "price": "50001.00", "amount": "0.8", "orders": 2 },
       { "price": "50002.00", "amount": "1.2", "orders": 4 }
     ]
   }

4. Frontend hiển thị depth chart:
   - Bids (màu xanh) - từ trên xuống, giá cao nhất trước
   - Asks (màu đỏ) - từ dưới lên, giá thấp nhất trước
   - Spread line ở giữa (50001.00 - 50000.00 = 1.00)

5. Polling: Refresh mỗi 5-10 giây để update order book
```

### 5.4 User Muốn Xem Recent Trades

```
1. User chọn market: BTC/USDT

2. Frontend gọi API:
   GET /markets/1/trades?limit=50

3. Response:
   [
     {
       "price": "50000.00",
       "amount": "0.1",
       "side": "BUY",
       "created_at": "2024-01-22T10:30:00.000Z"
     },
     {
       "price": "49999.00",
       "amount": "0.2",
       "side": "SELL",
       "created_at": "2024-01-22T10:29:00.000Z"
     }
   ]

4. Frontend hiển thị trade list:
   - Màu xanh cho BUY trades
   - Màu đỏ cho SELL trades
   - Sorted by created_at DESC (newest first)

5. Polling: Refresh mỗi 5 giây để update trades
```

### 5.5 Admin Thêm Market Pair Mới

```
1. Admin muốn thêm SOL/USDT

2. Admin gọi API:
   POST /markets
   {
     "baseCurrencyId": 4,  // SOL
     "quoteCurrencyId": 3, // USDT
     "priceScale": 2,
     "amountScale": 6,
     "minOrderAmount": "0.01",
     "makerFeeRate": 0.001,
     "takerFeeRate": 0.001,
     "isActive": true
   }

3. Backend validation:
   - Check SOL exists và is_tradable? (Pass)
   - Check USDT exists và is_tradable? (Pass)
   - Check SOL != USDT? (Pass)
   - Check pair combination unique? (Pass)
   - Auto-generate symbol: "SOL/USDT"

4. Response:
   {
     "success": true,
     "data": {
       "pair_id": 20,
       "symbol": "SOL/USDT",
       ...
     }
   }

5. System tự động:
   - Cache được invalidate
   - Users có thể trade SOL/USDT
   - Ticker data sẽ được tính toán từ trades
   - Order book sẽ được populate từ orders
```

---

## 6. Tích Hợp Với Các Module Khác

### 6.1 Currencies Module

**Mối quan hệ:**
- Market pair tham chiếu đến 2 currencies: `base_currency_id` và `quote_currency_id`
- Currencies phải `is_tradable = true` và `is_active = true` để tạo pair

**Ví dụ:**
```typescript
// Tạo market pair BTC/USDT
const btc = await currenciesService.findBySymbol('BTC');
const usdt = await currenciesService.findBySymbol('USDT');

// Validation
if (!btc.is_tradable || !btc.is_active) {
  throw new Error('BTC must be tradable and active');
}

if (!usdt.is_tradable || !usdt.is_active) {
  throw new Error('USDT must be tradable and active');
}

// Create pair
await marketsService.create({
  baseCurrencyId: btc.currency_id,
  quoteCurrencyId: usdt.currency_id
});
```

### 6.2 Orders Module

**Mối quan hệ:**
- Orders tham chiếu đến market pair qua `pair_id`
- Orders sử dụng fee rates từ market pair
- Orders format price/amount theo scales từ market pair

**Ví dụ:**
```typescript
// User tạo order
const pair = await marketsService.findOne(pairId);

const order = {
  user_id: 1,
  pair_id: pair.pair_id,
  side: 'BUY',
  price: '50000.00',  // Format theo pair.price_scale
  amount: '0.123456', // Format theo pair.amount_scale
  maker_fee_rate: pair.maker_fee_rate,
  taker_fee_rate: pair.taker_fee_rate
};
```

### 6.3 Trades Module

**Mối quan hệ:**
- Trades tham chiếu đến market pair qua `pair_id`
- Trades được aggregate để tính ticker data
- Trades được hiển thị trong recent trades

**Ví dụ:**
```typescript
// Calculate ticker từ trades
const trades = await tradesService.findByPairId(pairId, {
  since: twentyFourHoursAgo
});

const ticker = {
  lastPrice: trades[0]?.price || '0',
  high24h: Math.max(...trades.map(t => parseFloat(t.price))),
  low24h: Math.min(...trades.map(t => parseFloat(t.price))),
  volume24h: trades.reduce((sum, t) => sum + parseFloat(t.amount), 0)
};
```

### 6.4 Wallets Module

**Mối quan hệ:**
- User cần có wallet cho base currency và quote currency để trade
- Khi trade BTC/USDT, user cần wallet BTC (base) và wallet USDT (quote)

**Ví dụ:**
```typescript
// User muốn trade BTC/USDT
const pair = await marketsService.findOne(pairId);

// Check wallets
const btcWallet = await walletsService.findByUserAndCurrency(
  userId, 
  pair.base_currency_id
);

const usdtWallet = await walletsService.findByUserAndCurrency(
  userId, 
  pair.quote_currency_id
);

if (!btcWallet || !usdtWallet) {
  throw new Error('User must have both BTC and USDT wallets');
}
```

---

## 7. Tóm Tắt

### Markets Module là gì?

**Markets Module** là module trung tâm quản lý các trading pairs (cặp giao dịch) trong hệ thống trading platform. Module này kết nối Currencies với Trading, cho phép users giao dịch giữa các loại tiền ảo.

### Tại sao quan trọng?

1. **Trung tâm của trading**: Tất cả orders và trades đều tham chiếu đến market pairs
2. **Cung cấp market data**: Ticker, order book, recent trades cho trading interface
3. **Business rules**: Fee rates, price/amount scales, min order amount
4. **User experience**: Hiển thị market overview, depth chart, trade history
5. **Real-time data**: Cung cấp data real-time cho trading decisions

### Khi nào sử dụng?

- Khi cần hiển thị danh sách markets (trading interface, market selector)
- Khi cần hiển thị ticker data (market overview, price display)
- Khi cần hiển thị order book (depth chart, best bid/ask)
- Khi cần hiển thị recent trades (trade history, market activity)
- Khi user tạo order (validation, fee rates, scales)
- Khi admin quản lý markets (CRUD operations)

### Best Practices

1. **Luôn validate market pair** trước khi tạo order
2. **Sử dụng cached endpoints** (`/active`, `/tickers/all`) cho UI
3. **Check `is_active`** trước khi cho phép trading
4. **Format số theo `price_scale` và `amount_scale`** của pair
5. **Polling strategy phù hợp**: Ticker (30-60s), Order book (5-10s), Trades (5s)
6. **URL encode symbol** khi có dấu `/` (`BTC/USDT` → `BTC%2FUSDT`)
7. **Invalidate cache** sau khi update pair (tự động)

### Data Flow

```
Currencies → Markets → Orders/Trades
     ↓          ↓           ↓
  BTC, ETH   BTC/USDT   User Orders
  USDT       ETH/USDT   User Trades
```

1. **Currencies** cung cấp base và quote currencies
2. **Markets** tạo pairs từ currencies và cung cấp market data
3. **Orders/Trades** sử dụng pairs để thực hiện giao dịch

---

**Last Updated:** 2026-01-27  
**Version:** 1.0.0
