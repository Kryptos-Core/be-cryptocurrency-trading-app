---
paths:
  - "src/modules/matching/**/*.ts"
  - "src/modules/orders/**/*.ts"
  - "src/modules/wallets/**/*.ts"
  - "src/modules/blockchain/**/*.ts"
  - "src/modules/treasury/**/*.ts"
  - "src/modules/auth/**/*.ts"
---
# NestJS Sensitive Zones

> Quy tắc đặc biệt cho các module có rủi ro cao nhất trong hệ thống.
> Bất kỳ thay đổi nào trong các path này yêu cầu quy trình đặc biệt.

## Sensitive Modules

| Module | Risk | Mô tả |
|--------|------|-------|
| `matching/` | CRITICAL | Matching engine: STP, Redis Lua lock, circuit breaker, audit trail |
| `orders/` | CRITICAL | Vòng đời lệnh: create → match → fill/cancel; balance reservation |
| `wallets/` | HIGH | Số dư người dùng; ledger integrity |
| `blockchain/` | HIGH | Blockchain calls, wallet-connect, private key operations |
| `treasury/` | CRITICAL | Hot wallet management, funding, sweeping |
| `auth/` | HIGH | JWT, 2FA, session management, RBAC |

## Quy trình Bắt Buộc Trước Khi Sửa

### 1. Risk Assessment

Trước khi bắt đầu implement, viết file `docs/risk-<feature>.md` với:
- Mô tả thay đổi
- Các trường hợp edge case có thể xảy ra lỗi
- Ảnh hưởng đến tính toàn vẹn dữ liệu
- Kế hoạch rollback nếu có sự cố

### 2. Test Coverage Bắt Buộc

```typescript
// matching/ và orders/: 100% coverage cho business logic paths
describe('MatchingService', () => {
  it('matches BUY limit order with best ASK price')
  it('handles partial fill correctly')
  it('applies STP when maker and taker are same user')
  it('circuit breaker opens after N consecutive failures')
  it('redis lock prevents concurrent matching')
  it('audit log records all trade events')
})

// wallets/: test balance integrity
describe('WalletsService', () => {
  it('reserveBalance decrements available, increments reserved')
  it('releaseBalance restores available from reserved')
  it('concurrent reservations do not cause negative balance')
  it('ledger entries sum equals wallet balance')
})
```

### 3. Review Process

- Minimum **2 reviewers** (Tech Lead + 1 Senior)
- Không merge vào main trước 9am hoặc sau 5pm (giờ Việt Nam) — tránh deploy ngoài giờ hành chính
- Staging deployment + smoke test trước khi merge production

## Redis Lock Pattern (matching/)

```typescript
// ĐÚNG: Atomic lock với Lua script
const acquireLock = `
  return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2])
`;
const releaseLock = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  else
    return 0
  end
`;

// SAI: Non-atomic (race condition)
// if (!(await redis.get(key))) await redis.set(key, value, 'PX', ttl);
```

## Circuit Breaker (matching/)

Circuit breaker phải có ít nhất 3 trạng thái:
- `CLOSED` → hoạt động bình thường
- `OPEN` → từ chối requests, return error ngay lập tức
- `HALF_OPEN` → thử 1 request, nếu thành công → CLOSED, nếu thất bại → OPEN

```typescript
// Test circuit breaker state transitions bắt buộc
it('transitions CLOSED → OPEN after threshold failures')
it('transitions OPEN → HALF_OPEN after timeout')
it('transitions HALF_OPEN → CLOSED on success')
it('rejects requests immediately when OPEN')
```

## Audit Trail (matching/)

`AuditTradeVisitor` phải ghi vào `trade_audit_log` cho mọi sự kiện:
- `ORDER_CREATED`
- `ORDER_MATCHED`
- `ORDER_PARTIALLY_FILLED`
- `ORDER_FILLED`
- `ORDER_CANCELLED`
- `ORDER_REJECTED` (STP, circuit breaker)

```typescript
// Test audit logging
it('records audit log entry for every order state change')
it('audit entry contains userId, orderId, timestamp, old_status, new_status')
it('audit log is immutable — no updates or deletes')
```

## Slippage Protection (matching/)

```typescript
// Market orders phải kiểm tra slippage
it('rejects market order if slippage exceeds threshold')
it('fills market order at best available price within slippage tolerance')
```

## Wallet Integrity

Luôn verify sau khi thay đổi wallet:
- `available + reserved + locked == total_balance` (invariant)
- Mỗi thay đổi balance phải có `LedgerEntry` tương ứng

```typescript
// Invariant check (nên có trong service)
private validateWalletIntegrity(wallet: Wallet): void {
  const sum = wallet.available + wallet.reserved + wallet.locked;
  if (Math.abs(sum - wallet.totalBalance) > 1e-8) {
    throw new Error(`Wallet integrity violation: userId=${wallet.userId}`);
  }
}
```

## Blockchain Safety

```typescript
// KHÔNG log private key hoặc raw signed transaction
this.logger.log(`Signed tx for user ${userId}`); // GOOD — chỉ log userId
this.logger.log(`Raw tx: ${rawTx}`);              // BAD

// Mọi blockchain call phải có timeout
const tx = await Promise.race([
  this.provider.sendTransaction(signedTx),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30_000)),
]);
```
