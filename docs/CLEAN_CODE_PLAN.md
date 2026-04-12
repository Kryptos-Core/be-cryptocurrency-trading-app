# KẾ HOẠCH CLEAN CODE & REFACTOR TOÀN DIỆN

> **Ngày tạo**: 2026-04-12  
> **Codebase**: be-cryptocurrency-trading-app (NestJS Backend)  
> **Phân tích**: 448 file TypeScript, 20 NestJS modules  

---

## TỔNG QUAN

Sau khi phân tích kỹ lưỡng toàn bộ codebase, phát hiện **6 vấn đề chính**:
1. Dead code (code không bao giờ được dùng)
2. Duplicate logic (code trùng lặp)
3. Vi phạm pattern thiết kế
4. File quá lớn (vi phạm SRP)
5. Error handling không nhất quán
6. Thiếu shared utilities

Kế hoạch chia thành **5 Phase** có thể thực hiện độc lập.

---

## PHASE 1: XÓA DEAD CODE

**Ước tính**: 1-2 ngày | **Rủi ro**: Thấp

### 1.1 Xóa file placeholder/dead

| File | Lý do xóa |
|------|-----------|
| `src/modules/blockchain/providers/ton.provider.phase2.ts` | Chỉ export 1 const `TON_PROVIDER_PHASE2_PLACEHOLDER = true`, không ai import |
| `websocket-test.html` | File HTML test thủ công, không được reference từ source code |

### 1.2 Xóa function/export không sử dụng

- **`src/config/swagger.config.ts`** (dòng 367-386): `getSwaggerDocument()` — định nghĩa nhưng không bao giờ được import/gọi
- **`src/utils/helpers/name.helper.ts`**:
  - `getFullName()` (dòng 53) — không có nơi nào import
  - `isValidName()` (dòng 68) — không có nơi nào import
  - Giữ lại `capitalizeWords()` và `sanitizeName()` vì chúng được `formatName()` gọi nội bộ
- **`src/common/constants/stored-procedure-names.ts`**:
  - `STORED_PROCEDURE_NAMES` (dòng 129-141) — legacy aggregate, không ai import
  - `StoredProcedureNames` type (dòng 143) — không được import
- **`src/common/enums/index.ts`**: `PriceAlertCondition` enum (dòng 122-125) — không bao giờ được import/sử dụng
- **`src/common/decorators/api-version.decorator.ts`**: Toàn bộ file (`ApiVersion`, `ApiV1`, `ApiV2`) — không controller nào dùng
- **`src/common/decorators/api-response.decorator.ts`**: `ApiStandardResponse`, `ApiPaginatedResponse`, `ApiErrorResponse` — không sử dụng ở bất kỳ controller nào

### 1.3 Xóa debug code còn sót

- **`src/modules/auth/wallet-connect-auth.service.ts`** dòng 22-46:
  - Xóa toàn bộ function `agentWcAuthDebugLog()` và vùng `#region agent log`
  - Ghi file `debug-cb6ec4.log` trên disk — đây là debug code từ development session
- **`src/modules/blockchain/wallet-connect/wallet-connect.service.ts`** dòng 23-47:
  - Xóa toàn bộ function `agentWcLinkDebugLog()` và vùng `#region agent log`
  - Xóa import `appendFileSync` và `resolve` nếu không còn sử dụng

### 1.4 `delete()` và `hardDelete()` giống hệt nhau

**File**: `src/common/repositories/base.repository.ts` (dòng 224-267)

Cả hai đều gọi `this.repository.delete()`. Comment của `delete()` ghi "soft delete if entity has deletedAt" nhưng KHÔNG có logic soft delete.

**Hành động**:
- Xóa `hardDelete()`
- Đổi nơi gọi duy nhất `this.currencyRepository.hardDelete()` trong `src/modules/currencies/currencies.service.ts` (dòng 373) sang `delete()`
- Cập nhật `IRepository` interface tương ứng

### 1.5 Wrapper function thừa

**File**: `src/common/constants/chain-registry.ts` (dòng 212-217)

`listTreasuryOpsChainCodes()` chỉ là wrapper trực tiếp của `listActionableOnchainChainCodes()`:
```typescript
export function listTreasuryOpsChainCodes(...) { return listActionableOnchainChainCodes(...); }
```

**Hành động**:
- Xóa function này
- Đổi nơi gọi trong `src/modules/treasury/onchain-chain-picker.util.ts` (dòng 11, 89) sang `listActionableOnchainChainCodes()`

### 1.6 Orphan entities (cần xác nhận trước khi xóa)

**Entity `PriceAlert`** (`src/entities/price-alert.entity.ts`):
- Được đăng ký TypeORM, có relation trên `User` và `MarketPair`
- **Không có** repository, service, controller, hay module nào xử lý
- Swagger tag "price-alerts" tồn tại nhưng không có endpoint tương ứng
- → **Nếu không trong roadmap**: xóa entity, xóa `@OneToMany` relation trên User (dòng 85) và MarketPair (dòng 82), xóa Swagger tag
- → **Nếu có trong roadmap**: giữ lại, thêm TODO

**Entity `UserSession`** (`src/entities/user-session.entity.ts`):
- Tương tự — có entity nhưng auth dùng JWT + Redis, không có session management
- → Xác nhận trước khi xóa

---

## PHASE 2: XÓA CODE TRÙNG LẶP

**Ước tính**: 3-5 ngày | **Rủi ro**: Trung bình

### 2.1 **CRITICAL**: `AuthRepository` vs `UsersRepository` trùng lặp nặng

| Method | AuthRepo | UsersRepo | Giống nhau |
|--------|----------|-----------|-----------|
| `findByEmail()` | dòng 21-33 | dòng 45-56 | **100%** |
| `findById()` | dòng 37-47 | dòng 27-40 | **100%** |
| `emailExists()` | dòng 86-99 | dòng 252-265 | **95%** |
| `createUser()`/`create()` | dòng 53-81 | dòng 167-183 | **90%** |

**Hành động**:
1. `AuthService` inject trực tiếp `UsersRepository`
2. Xóa `AuthRepository.findByEmail()`, `findById()`, `emailExists()`, `createUser()`
3. Giữ lại các method riêng của Auth: `findByLinkedWallet()`, `createWalletOnlyUser()`, `setTwoFaEnabled()`, `updatePassword()`

### 2.2 `BuyQueueService` vs `SellQueueService` - 95% giống nhau

**File A**: `src/modules/matching/orderbook/buy-queue.service.ts`  
**File B**: `src/modules/matching/orderbook/sell-queue.service.ts`

Chỉ khác: sort direction và side check.

**Hành động**: Tạo shared `OrderQueueService`:
```typescript
class OrderQueueService implements IOrderQueue {
  constructor(
    private readonly side: 'BUY' | 'SELL',
    private readonly priceComparator: (a: bigint, b: bigint) => number
  ) {}
}
```

### 2.3 `buildNotFound()` trùng trên 3 blockchain providers

**Files**:
- `src/modules/blockchain/providers/ethereum.provider.ts` (dòng 196-206)
- `src/modules/blockchain/providers/tron.provider.ts` (dòng 170-180)
- `src/modules/blockchain/providers/solana.provider.ts` (dòng 224-234)

**Hành động**: Tạo shared utility `src/modules/blockchain/utils/build-not-found-tx.util.ts`:
```typescript
export function buildNotFoundTxStatus(txHash: string, network: BlockchainNetwork): BlockchainTxStatusDto {
  return { txHash, network, status: 'NOT_FOUND', confirmations: 0, from: '', to: '', value: '0' };
}
```

### 2.4 `MailService` - 2 methods gần giống nhau

**File**: `src/common/services/mail.service.ts` (dòng 40-93)

`sendOtp()` và `sendContactEmailVerificationOtp()` chỉ khác `subject` và `text` template. Logic gửi email, error handling, dev fallback giống hệt nhau.

**Hành động**: Tạo private method:
```typescript
private async sendEmailWithDevFallback(to: string, subject: string, text: string, logLabel: string): Promise<void>
```

### 2.5 Stored Procedure result extraction lặp 19+ lần

Pattern `result[0]?.[0]` xuất hiện tại: `auth.repository.ts` (8 lần), `users.repository.ts` (11 lần), và nhiều repo khác.

**Hành động**: Tạo `src/common/database/stored-procedure-result.util.ts`:
```typescript
/** Extract first row from MySQL stored procedure CALL result. */
export function spFirstRow<T>(result: any): T | null {
  return result[0]?.[0] ?? null;
}

/** Extract scalar value from SP result, e.g. for COUNT queries. */
export function spFirstValue<T>(result: any, key: string): T {
  return result[0]?.[0]?.[key];
}
```

### 2.6 Pagination `(page - 1) * limit` trùng 11 nơi

Xuất hiện tại: `base.repository.ts`, `currency.repository.ts`, `onchain-transfer.service.ts`, `market.repository.ts` (3 lần), `orders.service.ts` (2 lần), `users.service.ts`, `users.repository.ts` (2 lần).

**Hành động**: Tạo `src/common/utils/pagination.util.ts`:
```typescript
export interface PaginationInput { page?: number; limit?: number; }
export function calcSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}
```

### 2.7 Role decorator combination lặp 18 lần

`@RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)` xuất hiện 18 lần.

**Hành động**: Tạo `src/common/decorators/role-presets.ts`:
```typescript
export const RequireFinanceAccess = () => RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER);
export const RequireAdminOrSupport = () => RequireRoles(UserRole.ADMIN, UserRole.SUPPORT_AGENT, UserRole.RISK_OFFICER);
```

---

## PHASE 3: REFACTOR ARCHITECTURE

**Ước tính**: 5-7 ngày | **Rủi ro**: Trung bình

### 3.1 `OHLCVProviderRegistry` - lớp trung gian thừa

**File**: `src/modules/price-oracle/ohlcv-provider.registry.ts`

Chỉ delegate thẳng sang `BinanceOHLCVProvider` mà không thêm logic gì. Chỉ có 1 provider.

**Hành động**: Xóa registry, các nơi inject `OHLCVProviderRegistry` inject trực tiếp `BinanceOHLCVProvider`. Nếu tương lai cần nhiều provider → tạo lại với logic ưu tiên thực sự.

### 3.2 `onchain-transfer.service.ts` - 1370 dòng, vi phạm SRP

**File**: `src/modules/blockchain/onchain-transfer.service.ts`

**Hành động**: Tách thành:
- `OnchainDepositService` — xử lý deposit
- `OnchainWithdrawalService` — xử lý withdrawal, manual approve/reject
- `OnchainTransferQueryService` — get transaction history, pending list
- Giữ `OnchainTransferService` làm **facade** giữ nguyên public API

### 3.3 Redis config trùng lặp

**File A**: `src/app.module.ts` (dòng 55-62) — inline Redis config cho BullModule  
**File B**: `src/common/services/redis.service.ts` (dòng 114-130) — cùng config pattern

**Hành động**: Extract `getRedisConfig()` sang `src/config/redis.config.ts` và sử dụng ở cả hai nơi.

### 3.4 WalletConnect logic trùng giữa auth và blockchain module

**File A**: `src/modules/auth/wallet-connect-auth.service.ts`  
**File B**: `src/modules/blockchain/wallet-connect/wallet-connect.service.ts`

Cả hai có logic tương tự: init session, đợi approval, extract address từ CAIP account.

**Hành động**: Tạo shared `WcSessionManager` trong `src/modules/blockchain/wallet-connect/` với:
```typescript
class WcSessionManager {
  async initPairing(): Promise<string>
  async awaitApproval(uri: string): Promise<SessionTypes.Struct>
  extractAddressFromSession(session: SessionTypes.Struct): string
}
```

### 3.5 Binance API calls phân tán 5 nơi

| File | Endpoint |
|------|---------|
| `deposit-fx.service.ts` | `api.binance.com/api/v3/ticker/price` |
| `binance-ohlcv.provider.ts` | `api.binance.com/api/v3/klines` |
| `exchange-info-sync.service.ts` | `api.binance.com/api/v3/exchangeInfo` |
| `binance-price-feed.service.ts` | `api.binance.com/api/v3` |
| `binance.service.ts` | `fapi.binance.com` |

**Hành động**: Tạo `src/common/clients/binance-rest.client.ts` với:
- Base URL config
- Shared timeout handling (hiện tại mỗi nơi tự viết `AbortController` + `setTimeout`)
- Rate limit awareness
- Error normalization

---

## PHASE 4: NÂNG CAO ERROR HANDLING

**Ước tính**: 2-3 ngày | **Rủi ro**: Thấp

### 4.1 Loại bỏ pattern `catch (error) { this.logger.error(); throw error; }`

132 `catch` blocks xuất hiện trên 29 files. Nhiều repository methods chỉ log + re-throw — pattern này vô nghĩa vì `all-exceptions.filter.ts` đã log tất cả unhandled errors → log 2 lần gây noise.

### 4.2 Quy tắc Error Handling mới

| Layer | Hành động |
|-------|-----------|
| **Repository** | KHÔNG catch — để error bubble lên tự nhiên |
| **Service** | Catch và transform sang domain exceptions (`BadRequestException`, `BusinessException`, etc.) |
| **Controller** | Để NestJS exception filter xử lý |

Exception: Repository chỉ catch khi cần transform (ví dụ: detect MySQL duplicate key → throw `ConflictException`).

---

## PHASE 5: CODE ORGANIZATION

**Ước tính**: 1-2 ngày | **Rủi ro**: Thấp

### 5.1 Merge 2 utility directories

- `src/utils/helpers/name.helper.ts` → di chuyển vào `src/common/utils/name.util.ts`
- Xóa `src/utils/` directory
- Tất cả utility tập trung tại `src/common/utils/`

### 5.2 Extract Swagger CSS inline (270+ dòng)

**File**: `src/config/swagger.config.ts` (dòng 89-360)

**Hành động**: Extract ra `src/config/swagger-custom.css` và đọc bằng `fs.readFileSync()`.

### 5.3 Shared column type constants cho entities

Nhiều entity dùng cùng column definition:
```typescript
// src/common/constants/column-types.ts
export const DECIMAL_BALANCE = { type: 'decimal', precision: 36, scale: 18, default: 0 } as const;
```

---

## TÓM TẮT ƯU TIÊN THỰC HIỆN

| Phase | Độ phức tạp | Rủi ro | Ước tính | Tác động |
|-------|------------|--------|----------|----------|
| **Phase 1**: Xóa dead code | Thấp | Thấp | 1-2 ngày | Giảm noise, giảm bundle size |
| **Phase 2**: Xóa duplicate | Trung bình | Trung bình | 3-5 ngày | **Tăng maintainability lớn** |
| **Phase 3**: Refactor | Cao | Trung bình | 5-7 ngày | Tăng scalability |
| **Phase 4**: Error handling | Trung bình | Thấp | 2-3 ngày | Tăng log quality |
| **Phase 5**: Organization | Thấp | Thấp | 1-2 ngày | Tăng developer experience |

**Tổng**: ~12-19 ngày làm việc

---

## TIÊU CHÍ THÀNH CÔNG

- [ ] Tất cả dead code đã xóa (Phase 1 hoàn thành)
- [ ] Không còn method duplicate giữa `AuthRepository` và `UsersRepository`
- [ ] `BuyQueue`/`SellQueue` dùng shared base class
- [ ] `buildNotFound()` dùng shared utility
- [ ] `MailService` dùng 1 method gửi email chung
- [ ] Stored procedure result extraction dùng `spFirstRow()` helper
- [ ] Debug log code (`agentWcAuthDebugLog`, `agentWcLinkDebugLog`) đã xóa sạch
- [ ] `onchain-transfer.service.ts` tách thành <300 dòng mỗi file
- [ ] Tất cả existing tests vẫn pass (`npm test` sau mỗi phase)
- [ ] Không có regression — mọi API endpoint hoạt động như cũ

---

## RỦI RO VÀ BIỆN PHÁP GIẢM THIỂU

**Rủi ro 1**: Xóa code tưởng là "dead" nhưng thực tế được gọi qua reflection/dynamic import  
→ *Giảm thiểu*: Tìm kiếm cả string literal references trước khi xóa

**Rủi ro 2**: Refactor `AuthRepository` → `UsersRepository` có thể gây circular dependency  
→ *Giảm thiểu*: `AuthModule` đã import `UsersModule`, không có vấn đề. Test kỹ integration.

**Rủi ro 3**: Tách `onchain-transfer.service.ts` có thể break import chains  
→ *Giảm thiểu*: Tạo facade class giữ nguyên public API, chỉ tách logic nội bộ.

---

## CHECKLIST THỰC HIỆN

### Phase 1 — Files cần thay đổi
- [ ] `src/modules/blockchain/providers/ton.provider.phase2.ts` → **XÓA**
- [ ] `websocket-test.html` → **XÓA**
- [ ] `src/common/decorators/api-version.decorator.ts` → **XÓA**
- [ ] `src/config/swagger.config.ts` → xóa `getSwaggerDocument`, xóa tag "price-alerts"
- [ ] `src/utils/helpers/name.helper.ts` → xóa `getFullName`, `isValidName`
- [ ] `src/common/constants/stored-procedure-names.ts` → xóa `STORED_PROCEDURE_NAMES`, `StoredProcedureNames`
- [ ] `src/common/enums/index.ts` → xóa `PriceAlertCondition`
- [ ] `src/common/constants/chain-registry.ts` → xóa `listTreasuryOpsChainCodes`
- [ ] `src/modules/auth/wallet-connect-auth.service.ts` → xóa debug region
- [ ] `src/modules/blockchain/wallet-connect/wallet-connect.service.ts` → xóa debug region
- [ ] `src/common/repositories/base.repository.ts` → xóa `hardDelete`
- [ ] `src/common/repositories/interfaces/irepository.interface.ts` → xóa `hardDelete`
- [ ] `src/entities/price-alert.entity.ts` → xác nhận rồi xóa/giữ
- [ ] `src/entities/user-session.entity.ts` → xác nhận rồi xóa/giữ

### Phase 2 — Files cần thay đổi
- [ ] `src/modules/auth/repositories/auth.repository.ts` → xóa methods trùng, delegate sang UsersRepository
- [ ] `src/modules/matching/orderbook/buy-queue.service.ts` → refactor dùng shared base
- [ ] `src/modules/matching/orderbook/sell-queue.service.ts` → refactor dùng shared base
- [ ] `src/modules/blockchain/utils/build-not-found-tx.util.ts` → **TẠO MỚI**
- [ ] `src/common/services/mail.service.ts` → extract shared method
- [ ] `src/common/database/stored-procedure-result.util.ts` → **TẠO MỚI**
- [ ] `src/common/utils/pagination.util.ts` → **TẠO MỚI**
- [ ] `src/common/decorators/role-presets.ts` → **TẠO MỚI**

### Phase 3 — Files cần thay đổi
- [ ] `src/modules/price-oracle/ohlcv-provider.registry.ts` → **XÓA**, sửa imports
- [ ] `src/modules/blockchain/onchain-transfer.service.ts` → **TÁCH FILE**
- [ ] `src/config/redis.config.ts` → thêm shared config function
- [ ] `src/app.module.ts` → dùng `getRedisConfig()`
- [ ] `src/modules/blockchain/wallet-connect/wc-session-manager.ts` → **TẠO MỚI**
- [ ] `src/common/clients/binance-rest.client.ts` → **TẠO MỚI**
