# Wallet Module - Repository Pattern + Database Procedure Pattern

## Kiến Trúc (Architecture)

### Design Patterns Áp Dụng:

1. **Repository Pattern** - Tách data access layer từ business logic
2. **Service Layer Pattern** - Centralized business logic
3. **Unit of Work Pattern** - Transaction management với EntityManager
4. **Database Procedure Pattern** - Complex logic ở database layer
5. **Double Entry Accounting** - Audit trail cho mọi transaction

## Cấu Trúc Module

```
src/modules/wallets/
├── wallets.module.ts              # Module definition
├── wallets.controller.ts          # HTTP endpoints
├── wallets.service.ts             # Business logic
├── repositories/
│   ├── wallet.repository.ts       # Wallet data access
│   └── wallet-ledger.repository.ts # Ledger audit trail
└── dto/
    ├── wallet-balance.dto.ts      # Balance response
    └── wallet-transaction.dto.ts  # Transaction request
```

## Transactions & State Management

### Transaction Safety (Unit of Work)
- Toàn bộ wallet operations được wrap trong database transaction
- Pessimistic locking ở database level để tránh race condition
- Double-entry ledger được tạo atomically cùng balance update

### Stored Procedures
- `sp_wallet_find_by_user_currency` - Find wallet
- `sp_wallet_get_or_create_for_update` - Get/create với pessimistic write lock
- `sp_wallet_apply_balance_delta` - Apply balance change safely
- `sp_wallet_ledger_create` - Create audit trail entry

### Available vs Frozen Balance
- **Available**: Balance có thể dùng ngay (unlocked)
- **Frozen**: Balance bị lock (e.g., pending order, collateral)

### Wallet Actions
1. **CREDIT** - Thêm available balance (deposit, transfer in)
2. **DEBIT** - Bớt available balance (withdrawal, transfer out)
3. **FREEZE** - Move từ available → frozen (place order)
4. **UNFREEZE** - Move từ frozen → available (cancel order)
5. **TRANSFER** - Transfer giữa users

## Double Entry Accounting

Mỗi transaction tạo 2 ledger entries:
- **CREDIT**: Money in (source is positive)
- **DEBIT**: Money out (destination is negative)

```
Transfer 10 BTC from User A to User B:
→ Ledger User A: DEBIT 10 BTC
→ Ledger User B: CREDIT 10 BTC
```

## Decimal.js Usage

Sử dụng `Decimal.js` cho precise arithmetic (tránh floating point errors):

```typescript
const amount = new Decimal('100.123456789012345678');
const fee = amount.times('0.001');
const total = amount.plus(fee);
```

## Redis Integration (Future)

Có thể add caching ở frontend layer:
- Cache balance cho read-heavy operations
- Invalidate cache sau mỗi transaction
- Real-time balance updates via WebSocket

## Testing Guide

```bash
# Create wallet
POST /wallets/transactions
{
  "currencyId": 1,
  "amount": "100",
  "action": "CREDIT",
  "refType": "DEPOSIT",
  "refId": 1001
}

# Get balance
GET /wallets/balance?currencyId=1

# Freeze funds for order
POST /wallets/transactions
{
  "currencyId": 1,
  "amount": "50",
  "action": "FREEZE",
  "refType": "ORDER",
  "refId": 2001
}

# Unfreeze on order cancel
POST /wallets/transactions
{
  "currencyId": 1,
  "amount": "50",
  "action": "UNFREEZE",
  "refType": "ORDER",
  "refId": 2001
}
```
