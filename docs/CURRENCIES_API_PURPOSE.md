# Mục Đích Của API Currency

## Tổng Quan

API Currency quản lý danh sách tiền ảo (BTC, ETH, USDT, ...) và là **nền tảng cốt lõi** cho các module khác trong hệ thống trading. Module này cung cấp thông tin và cấu hình cho tất cả các hoạt động liên quan đến tiền ảo trong platform.

---

## 1. Quản Lý Danh Sách Tiền Ảo

### Chức Năng Chính

- **Lưu trữ thông tin** các loại tiền ảo:
  - `symbol`: Mã tiền (BTC, ETH, USDT, ...)
  - `name`: Tên đầy đủ (Bitcoin, Ethereum, Tether, ...)
  - `precision_scale`: Số chữ số thập phân (0-18)
  - `min_withdraw`: Số tiền tối thiểu có thể rút
  - `is_tradable`: Có thể giao dịch không
  - `is_active`: Trạng thái active/inactive

### CRUD Operations

- **Create**: Tạo currency mới
- **Read**: Xem danh sách, chi tiết currency
- **Update**: Cập nhật thông tin currency
- **Delete**: Vô hiệu hóa currency (soft delete - set `is_active = false`)

### Filtering & Querying

- Lọc theo trạng thái: `active` / `inactive`
- Lọc theo khả năng giao dịch: `tradable` / `non-tradable`
- Pagination cho danh sách lớn
- Tìm kiếm theo `symbol` hoặc `ID`

---

## 2. Cấu Hình Cho Các Module Khác

Currency được sử dụng như **foreign key** và **reference** trong nhiều module khác:

### 2.1 Market Pairs (Thị Trường)

**Mối quan hệ:**
```
BTC/USDT → BTC là base_currency, USDT là quote_currency
ETH/BTC  → ETH là base_currency, BTC là quote_currency
```

**Chức năng:**
- Tạo market pairs (BTC/USDT, ETH/USDT, ...)
- Currency phải `is_active = true` và `is_tradable = true` để tạo pair
- Validate currency tồn tại trước khi tạo pair

**Ví dụ:**
```typescript
// Tạo market pair BTC/USDT
const btc = await currenciesService.findBySymbol('BTC');  // base_currency
const usdt = await currenciesService.findBySymbol('USDT'); // quote_currency

// Check validation
if (!btc.is_active || !btc.is_tradable) {
  throw new Error('BTC must be active and tradable');
}
```

### 2.2 Wallets (Ví Tiền)

**Mối quan hệ:**
```
User có ví BTC, ví ETH, ví USDT...
Mỗi user có nhiều ví, mỗi ví thuộc một currency
```

**Chức năng:**
- Mỗi user có thể có nhiều wallets, mỗi wallet cho một currency
- Wallet Ledger ghi lại mọi giao dịch theo currency
- Balance được quản lý theo từng currency

**Ví dụ:**
```typescript
// User có 3 wallets
wallet_1: { user_id: 1, currency_id: 1 (BTC), available: 0.5 }
wallet_2: { user_id: 1, currency_id: 2 (ETH), available: 10 }
wallet_3: { user_id: 1, currency_id: 3 (USDT), available: 1000 }
```

### 2.3 Trading (Giao Dịch)

**Mối quan hệ:**
```
Trade BTC/USDT → Fee được tính bằng currency nào?
Orders và Trades tham chiếu currency
```

**Chức năng:**
- Orders và Trades tham chiếu đến currency
- Fee currency xác định loại tiền tính phí (thường là quote currency)
- Validate currency trước khi tạo order

**Ví dụ:**
```typescript
// Trade BTC/USDT
const trade = {
  pair_id: 1, // BTC/USDT
  price: 50000,
  amount: 0.1,
  fee_currency_id: 3, // USDT (quote currency)
  taker_fee: 0.001,   // 0.1% fee in USDT
  maker_fee: 0.001
};
```

### 2.4 Deposits/Withdrawals (Nạp/Rút)

**Mối quan hệ:**
```
User nạp 0.5 BTC → Currency = BTC
User rút 100 USDT → Currency = USDT
```

**Chức năng:**
- Mỗi giao dịch nạp/rút gắn với một currency
- Kiểm tra `min_withdraw` trước khi cho phép rút
- Validate currency `is_active` trước khi xử lý

**Ví dụ:**
```typescript
// User rút 0.5 BTC
const btc = await currenciesService.findBySymbol('BTC');

// Validation
if (withdrawAmount < parseFloat(btc.min_withdraw)) {
  throw new Error(`Amount must be >= ${btc.min_withdraw} BTC`);
}

if (!btc.is_active) {
  throw new Error('BTC is not active');
}
```

---

## 3. Use Cases Thực Tế

### 3.1 Frontend Hiển Thị

#### Lấy danh sách currencies để hiển thị dropdown

```typescript
// API Call
GET /currencies/active

// Response
{
  "success": true,
  "data": [
    { "currency_id": 1, "symbol": "BTC", "name": "Bitcoin" },
    { "currency_id": 2, "symbol": "ETH", "name": "Ethereum" },
    { "currency_id": 3, "symbol": "USDT", "name": "Tether" }
  ]
}

// Frontend: Hiển thị dropdown
<select>
  <option value="1">BTC - Bitcoin</option>
  <option value="2">ETH - Ethereum</option>
  <option value="3">USDT - Tether</option>
</select>
```

#### Lấy currency info để validate input

```typescript
// API Call
GET /currencies/symbol/BTC

// Response
{
  "success": true,
  "data": {
    "currency_id": 1,
    "symbol": "BTC",
    "name": "Bitcoin",
    "precision_scale": 8,
    "min_withdraw": "0.001",
    "is_tradable": true,
    "is_active": true
  }
}

// Frontend Validation
const btc = response.data;

// Input chỉ cho phép 8 số thập phân
<input 
  type="number" 
  step="0.00000001"  // 8 decimals
  min={btc.min_withdraw}
/>

// Validation message
if (amount < parseFloat(btc.min_withdraw)) {
  showError(`Minimum withdrawal: ${btc.min_withdraw} BTC`);
}
```

### 3.2 Backend Validation

#### Khi user tạo order

```typescript
async createOrder(userId: number, pairId: number, amount: number) {
  // 1. Get market pair
  const pair = await marketPairsService.findOne(pairId);
  
  // 2. Get base currency
  const baseCurrency = await currenciesService.findOne(pair.base_currency_id);
  
  // 3. Validation
  if (!baseCurrency.is_tradable) {
    throw new BadRequestException('Currency is not tradable');
  }
  
  if (!baseCurrency.is_active) {
    throw new BadRequestException('Currency is not active');
  }
  
  // 4. Format số theo precision_scale
  const formattedAmount = parseFloat(amount.toFixed(baseCurrency.precision_scale));
  
  // 5. Create order
  return this.ordersService.create({
    user_id: userId,
    pair_id: pairId,
    amount: formattedAmount.toString()
  });
}
```

#### Khi user rút tiền

```typescript
async withdraw(userId: number, currencySymbol: string, amount: string) {
  // 1. Get currency
  const currency = await currenciesService.findBySymbol(currencySymbol);
  
  // 2. Check currency is active
  if (!currency.is_active) {
    throw new BadRequestException(`${currencySymbol} is not active`);
  }
  
  // 3. Check minimum withdrawal
  if (parseFloat(amount) < parseFloat(currency.min_withdraw)) {
    throw new BadRequestException(
      `Amount must be >= ${currency.min_withdraw} ${currencySymbol}`
    );
  }
  
  // 4. Process withdrawal
  return this.withdrawalsService.create({
    user_id: userId,
    currency_id: currency.currency_id,
    amount: amount
  });
}
```

---

## 4. Các Endpoint Và Mục Đích

| Endpoint | Method | Mục Đích | Use Case |
|----------|--------|----------|----------|
| `/currencies` | GET | Lấy danh sách với pagination | Admin panel, dropdown với filter |
| `/currencies/active` | GET | Lấy active currencies (cached) | UI dropdown, hiển thị danh sách |
| `/currencies/tradable` | GET | Lấy tradable currencies (cached) | Hiển thị market, trading pairs |
| `/currencies/:id` | GET | Lấy chi tiết currency theo ID | Chi tiết currency, validation |
| `/currencies/symbol/:symbol` | GET | Tìm currency theo symbol | Validation, lookup nhanh |
| `/currencies` | POST | Tạo currency mới | Admin thêm currency mới |
| `/currencies/:id` | PATCH | Cập nhật currency | Admin cập nhật thông tin |
| `/currencies/:id` | DELETE | Vô hiệu hóa currency | Admin soft delete currency |

### Chi Tiết Endpoints

#### GET /currencies
**Mục đích:** Lấy danh sách currencies với pagination và filtering

**Query Parameters:**
- `page` (optional, default: 1): Số trang
- `limit` (optional, default: 10): Số items/trang
- `includeInactive` (optional, default: false): Bao gồm inactive currencies

**Use Cases:**
- Admin panel: Xem tất cả currencies
- Dropdown với filter: Lọc theo active/inactive

#### GET /currencies/active
**Mục đích:** Lấy danh sách active currencies (cached trong Redis)

**Use Cases:**
- UI dropdown: Hiển thị currencies có thể sử dụng
- Deposit/Withdraw form: Chọn currency để nạp/rút
- Wallet creation: Tạo wallet cho active currencies

#### GET /currencies/tradable
**Mục đích:** Lấy danh sách tradable và active currencies (cached)

**Use Cases:**
- Trading interface: Hiển thị currencies có thể trade
- Market pairs creation: Chọn currencies để tạo pair
- Order form: Chọn base/quote currency

#### GET /currencies/:id
**Mục đích:** Lấy chi tiết currency theo ID

**Use Cases:**
- Currency detail page
- Validation: Check currency info trước khi thao tác
- Admin panel: Xem chi tiết currency

#### GET /currencies/symbol/:symbol
**Mục đích:** Tìm currency theo symbol (BTC, ETH, ...)

**Use Cases:**
- Quick lookup: Tìm currency nhanh bằng symbol
- Validation: Check currency exists trước khi tạo order/deposit
- API integration: External API trả về symbol, cần lookup currency_id

#### POST /currencies
**Mục đích:** Tạo currency mới (Admin only)

**Use Cases:**
- Admin thêm currency mới vào hệ thống
- Onboarding currency mới từ exchange

#### PATCH /currencies/:id
**Mục đích:** Cập nhật currency (Admin only)

**Use Cases:**
- Update currency info (name, precision, min_withdraw)
- Enable/disable currency (is_active, is_tradable)
- Adjust minimum withdrawal amount

#### DELETE /currencies/:id
**Mục đích:** Vô hiệu hóa currency (soft delete)

**Use Cases:**
- Disable currency không còn sử dụng
- Temporary disable currency để maintenance

---

## 5. Ví Dụ Luồng Sử Dụng

### 5.1 User Muốn Trade BTC/USDT

```
1. Frontend gọi API:
   GET /currencies/tradable

2. Response trả về danh sách tradable currencies:
   [
     { symbol: "BTC", name: "Bitcoin" },
     { symbol: "ETH", name: "Ethereum" },
     { symbol: "USDT", name: "Tether" }
   ]

3. Frontend hiển thị dropdown:
   - Base Currency: BTC, ETH, ...
   - Quote Currency: USDT, BTC, ...

4. User chọn:
   - Base: BTC
   - Quote: USDT

5. Frontend tạo order với pair BTC/USDT
```

### 5.2 User Muốn Nạp Tiền

```
1. Frontend gọi API:
   GET /currencies/active

2. Response trả về danh sách active currencies:
   [
     { currency_id: 1, symbol: "BTC", name: "Bitcoin" },
     { currency_id: 2, symbol: "ETH", name: "Ethereum" },
     { currency_id: 3, symbol: "USDT", name: "Tether" }
   ]

3. Frontend hiển thị dropdown:
   <select>
     <option value="1">BTC - Bitcoin</option>
     <option value="2">ETH - Ethereum</option>
     <option value="3">USDT - Tether</option>
   </select>

4. User chọn BTC

5. Backend validation:
   - Check BTC có is_active = true? (Pass)
   - Proceed với deposit
```

### 5.3 User Muốn Rút 0.0005 BTC

```
1. User nhập amount: 0.0005 BTC

2. Frontend gọi API để validate:
   GET /currencies/symbol/BTC

3. Response:
   {
     "currency_id": 1,
     "symbol": "BTC",
     "min_withdraw": "0.001"
   }

4. Frontend validation:
   if (0.0005 < 0.001) {
     showError("Amount must be >= 0.001 BTC");
     return;
   }

5. Backend validation (double check):
   - Get currency: BTC
   - Check: 0.0005 < 0.001? (Fail)
   - Reject: "Amount must be >= 0.001 BTC"
```

### 5.4 Admin Thêm Currency Mới

```
1. Admin muốn thêm DOGE (Dogecoin)

2. Admin gọi API:
   POST /currencies
   {
     "symbol": "DOGE",
     "name": "Dogecoin",
     "precisionScale": 8,
     "minWithdraw": "10",
     "isTradable": true,
     "isActive": true
   }

3. Backend validation:
   - Check symbol exists? (chưa có)
   - Create currency (Success)

4. Response:
   {
     "success": true,
     "data": {
       "currency_id": 64,
       "symbol": "DOGE",
       "name": "Dogecoin",
       ...
     }
   }

5. System tự động:
   - Cache được invalidate
   - Có thể tạo market pairs với DOGE
   - Users có thể tạo wallet DOGE
```

---

## 6. Tóm Tắt

### Currency Module là gì?

**Currency Module** là module cốt lõi quản lý danh sách tiền ảo trong hệ thống trading platform.

### Tại sao quan trọng?

1. **Nền tảng cho các module khác**: Market Pairs, Wallets, Trades, Deposits/Withdrawals đều phụ thuộc vào Currency
2. **Validation & Configuration**: Cung cấp thông tin để validate và cấu hình cho các operations
3. **User Experience**: Cung cấp data cho UI (dropdowns, lists, details)
4. **Business Logic**: Enforce business rules (min_withdraw, is_tradable, is_active)

### Khi nào sử dụng?

- Khi cần hiển thị danh sách currencies (dropdown, list)
- Khi cần validate input (amount, precision)
- Khi cần check business rules (min_withdraw, is_active)
- Khi cần lookup currency info (symbol → currency_id)
- Khi admin quản lý currencies

### Best Practices

1. **Luôn validate currency** trước khi thao tác
2. **Sử dụng cached endpoints** (`/active`, `/tradable`) cho UI
3. **Check `is_active` và `is_tradable`** trước khi tạo order/pair
4. **Format số theo `precision_scale`** của currency
5. **Invalidate cache** sau khi update currency (tự động)

---

## 7. Related Documentation

- [Currencies Module Guide](./CURRENCIES_MODULE_GUIDE.md) - Technical implementation details
- [Currencies Stored Procedures Guide](./CURRENCIES_STORED_PROCEDURES_GUIDE.md) - Database procedures
- [Frontend UI Guide](./FRONTEND_UI_GUIDE.md) - Frontend integration
- [API Documentation](../postman/Cryptocurrency-Trading-API.postman_collection.json) - Postman collection

---

**Last Updated:** 2026-01-22  
**Version:** 1.0.0
