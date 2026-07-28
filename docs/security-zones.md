# Security Zones — NestJS Backend

> Last reviewed: 2026-07-28 — verified against `src/modules/` (matching, orders, treasury, wallets, blockchain, auth, deposits, migrations, entities, config).

## Tổng Quan

Backend xử lý giao dịch tài chính thực. Các zone dưới đây có rủi ro cao nhất — **đọc kỹ trước khi sửa bất kỳ file nào trong đó**.

## Zone Map

| Module | Risk | Lý do |
|--------|------|-------|
| `src/modules/matching/` | CRITICAL | Matching engine: Redis Lua lock, STP, circuit breaker, audit trail |
| `src/modules/orders/` | CRITICAL | Order lifecycle, balance reservation, state machine |
| `src/modules/treasury/` | CRITICAL | Hot wallet management, sweeping, funding |
| `src/modules/wallets/` | HIGH | User balance: available/reserved/locked invariant |
| `src/modules/blockchain/` | HIGH | Blockchain calls, WalletConnect, private key handling |
| `src/modules/auth/` | HIGH | JWT, RBAC, 2FA |
| `src/modules/deposits/` | HIGH | Fiat và crypto deposits, payment webhook |
| `src/migrations/` | HIGH | Database schema changes — không reversible khi production |
| `src/entities/` | MEDIUM | Data model — thay đổi phải có migration tương ứng |
| `src/config/env.validation.ts` | HIGH | Env schema — missing validation = runtime crash |

## Quy Trình Bắt Buộc Theo Risk Level

### CRITICAL (matching, orders, treasury)

1. **Risk Assessment** — tạo `docs/risk-<feature>-<date>.md` với:
   - Mô tả thay đổi
   - Edge cases có thể gây lỗi
   - Ảnh hưởng đến tính toàn vẹn dữ liệu
   - Kế hoạch rollback

2. **Test Coverage** — 100% cho business logic paths:
   - Happy path
   - All error paths (InsufficientBalance, OrderNotFound, v.v.)
   - Concurrent access scenarios
   - Circuit breaker state transitions

3. **Review** — minimum 2 reviewers (Tech Lead + 1 Senior)

4. **Deploy Window** — chỉ deploy 9am-5pm (GMT+7), không deploy thứ 6 chiều

### HIGH (wallets, blockchain, auth, deposits, migrations)

1. Unit + integration tests cho mọi thay đổi
2. Security review trước khi merge
3. 1 reviewer minimum (Tech Lead hoặc Senior)

### MEDIUM (entities, config)

- Standard PR review process
- Đảm bảo migration tương ứng nếu sửa entity

## Bất Biến Hệ Thống (System Invariants)

### Wallet Balance Invariant

```
wallet.available + wallet.reserved + wallet.locked == wallet.totalBalance
```

Phải đúng sau **mọi** operation. Nếu vi phạm: dừng lại, alert ngay.

### Order State Machine

```
PENDING → MATCHING → PARTIALLY_FILLED → FILLED
                  ↘ CANCELLED
         PENDING → CANCELLED
```

Không có transition nào khác hợp lệ.

### Audit Trail

Mọi order state change phải có entry trong `trade_audit_log`. Không có ngoại lệ.

## Redis Lock Invariant

Lock acquisition phải dùng Lua script atomic. **KHÔNG** dùng `SETNX` + `EXPIRE` riêng biệt.

## Secrets Management

- Private keys **không bao giờ** đi qua application logs
- Hot wallet credentials trong biến env, không trong code
- `src/config/env.validation.ts` là source of truth cho env schema

## Incident Response

Nếu phát hiện lỗi production trong sensitive zone:
1. Alert Tech Lead ngay lập tức
2. Đánh giá xem có cần halt trading không
3. Kiểm tra `trade_audit_log` để tìm scope
4. Fix trong branch riêng, deploy qua standard process (không hotfix tắt CI)
