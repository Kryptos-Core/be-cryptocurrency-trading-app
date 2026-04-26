# Kế hoạch chuyển `treasury-e2e.env.example` sang cấu hình DB + UI

Ngày tạo: 2026-04-27  
Phạm vi: Backend `be-cryptocurrency-trading-app`, Flutter admin UI `fe-cryptocurrency-trading-app`  
Nguồn yêu cầu: Các biến trong `be-cryptocurrency-trading-app/scripts/treasury-e2e.env.example` hiện đang được quản lý bằng file env cục bộ; cần chuyển sang DB và cho phép tài khoản có role phù hợp, ưu tiên `FINANCE_MANAGER`, thêm/xóa/sửa trên UI giống khu vực cấu hình thanh toán.

---

## CAPABILITY

Sau khi hoàn thành, `FINANCE_MANAGER` hoặc `ADMIN` có thể quản lý cấu hình chạy Treasury Daily/E2E trực tiếp trong UI thay vì sửa file `scripts/treasury-e2e.env`: API base URL, danh tính/tokens test, chain, linked wallet, amount test rút/nạp, chế độ skip/strict và các threshold vận hành. Scheduler/script treasury sẽ đọc cấu hình hiệu lực từ DB qua service/API nội bộ, có fallback an toàn cho dev, có audit trail và mã hóa thông tin nhạy cảm.

---

## 1. Vấn đề hiện tại

File `scripts/treasury-e2e.env.example` chứa các nhóm cấu hình:

```env
E2E_API_BASE_URL=http://127.0.0.1:3000
E2E_BEARER_TOKEN_TRADER=
E2E_BEARER_TOKEN_RISK=
E2E_CHAIN=BSC_CHAPEL
E2E_LINKED_WALLET_ID=
E2E_WITHDRAW_AMOUNT_AUTO=0.01
E2E_WITHDRAW_AMOUNT_MANUAL=1.0
E2E_DEPOSIT_TX_HASH=
E2E_DEPOSIT_AMOUNT=
TREASURY_E2E_ALLOW_SKIP=true
TREASURY_HEALTH_FAIL_ON_CRITICAL=false
```

Hạn chế:

- Cần sửa file trên máy/chạy scheduler, khó quản lý qua UI.
- Không có audit ai thay đổi cấu hình, thay đổi lúc nào.
- Tokens có nguy cơ nằm trong file plaintext.
- Khó phân quyền cho đúng vai trò nghiệp vụ.
- Khó chuẩn hóa giữa dev/staging/CI.
- Health threshold hiện có một phần đọc env, một phần đọc `system_configs`, dẫn tới nguồn cấu hình chưa thống nhất.

---

## 2. CONSTRAINTS

### 2.1 Quy tắc cố định

- `FINANCE_MANAGER` là role nghiệp vụ phù hợp để quản lý cấu hình treasury/payment vận hành.
- `ADMIN` có thể có quyền quản trị tương đương hoặc cao hơn.
- Các thông tin nhạy cảm như bearer token, private credential, API token không được trả về plaintext trong list API.
- Cấu hình phải có audit trail: `created_by`, `updated_by`, `created_at`, `updated_at` tối thiểu.
- Script `treasury:daily`, `treasury:e2e`, `treasury:health` vẫn phải chạy được trong dev khi DB/config chưa sẵn sàng nếu `allow_skip=true`.
- Không phá vỡ flow hiện tại ngay lập tức; cần giai đoạn migration/fallback từ env sang DB.
- Cấu hình liên quan testnet/E2E không được vô tình áp dụng production mainnet nếu chưa có guard rõ ràng.

### 2.2 Trust boundary

- UI admin là nơi nhập/sửa cấu hình, nhưng BE là nguồn xác thực cuối cùng.
- DB là source of truth mới cho cấu hình treasury E2E/health.
- Scheduler/script không nên tự tin vào file env nếu DB đã có cấu hình active.
- Secrets trong DB phải mã hóa bằng cơ chế tương tự `payment_method_configs.encrypted_config` hoặc service mã hóa hiện có.

### 2.3 Chính sách bảo mật

- Không log token hoặc secret khi chạy E2E/health.
- API list chỉ trả metadata và masked secret, ví dụ `hasTraderToken=true`, `traderTokenPreview="****abcd"` nếu cần.
- API detail/edit chỉ trả plaintext secret nếu thật sự cần; khuyến nghị UI không hiển thị lại token cũ, chỉ cho nhập token mới để replace.
- Tất cả mutation phải yêu cầu JWT + role + permission.
- Nên thêm permission riêng thay vì tái sử dụng mơ hồ:
  - `TREASURY_E2E_CONFIG_MANAGE = 'treasury_e2e_config:manage'`
  - hoặc nếu muốn gom chung: mở rộng `PAYMENT_CONFIGS_MANAGE` cho tab này, nhưng cách này ít rõ ràng hơn.

---

## 3. IMPLEMENTATION CONTRACT

### 3.1 Actors

- `FINANCE_MANAGER`
  - Xem danh sách cấu hình treasury E2E/health.
  - Tạo/sửa/xóa mềm/activate/deactivate cấu hình.
  - Cập nhật token/danh tính test và input testnet.
- `ADMIN`
  - Toàn quyền như `FINANCE_MANAGER`.
  - Có thể override/khôi phục cấu hình nếu cần.
- `RISK_OFFICER`
  - Khuyến nghị chỉ xem health/reconciliation hoặc chạy manual review; không nên được sửa cấu hình E2E token mặc định.
- Scheduler/runner
  - Đọc cấu hình active từ DB hoặc endpoint nội bộ trước khi chạy E2E/health.

### 3.2 UI surfaces

Đặt trong khu vực admin/finance hiện có, gần tab cấu hình thanh toán:

- Menu đề xuất: **Admin / Tài chính / Cấu hình Treasury E2E**.
- Có thể là tab cạnh `payment_config`:
  - `Cấu hình thanh toán`
  - `Cấu hình Treasury E2E`
  - `Health thresholds` hoặc gom chung trong cùng màn hình.

UI cần có các khu vực:

1. **Danh sách cấu hình**
   - Tên cấu hình, environment, status, chain, allow skip, strict health, updated_by, updated_at.
2. **Form tạo/sửa**
   - General:
     - `display_name`
     - `environment`: `development | staging | ci | production` hoặc enum tương đương.
     - `status`: `ACTIVE | INACTIVE`.
     - `api_base_url`.
   - E2E identities/secrets:
     - `trader_bearer_token` hoặc cơ chế identity thay thế.
     - `risk_bearer_token` hoặc cơ chế identity thay thế.
   - Withdrawal inputs:
     - `chain`
     - `linked_wallet_id`
     - `withdraw_amount_auto`
     - `withdraw_amount_manual`
   - Optional deposit E2E:
     - `deposit_tx_hash`
     - `deposit_amount`
     - `deposit_enabled` hoặc tự suy từ 2 field trên.
   - Runner mode:
     - `allow_skip`
     - `health_fail_on_critical`
   - Health thresholds:
     - `stale_manual_minutes`
     - `stale_confirming_minutes`
     - `failed_withdrawals_24h`
     - `reconcile_pair_limit`
     - `reconciliation_threshold`
3. **Actions**
   - Tạo cấu hình.
   - Sửa cấu hình.
   - Activate/deactivate.
   - Xóa mềm hoặc archive.
   - Test connection/readiness: kiểm tra URL, token format, linked wallet tồn tại, chain hợp lệ.
   - Xuất preview env masked để debug.

### 3.3 Backend API đề xuất

Controller mới, ví dụ: `TreasuryE2EConfigController`.

Base path đề xuất:

```text
/api/v1/treasury/e2e-configs
```

Endpoints:

```text
GET    /treasury/e2e-configs
GET    /treasury/e2e-configs/options
GET    /treasury/e2e-configs/:id
POST   /treasury/e2e-configs
PUT    /treasury/e2e-configs/:id
POST   /treasury/e2e-configs/:id/activate
POST   /treasury/e2e-configs/:id/deactivate
DELETE /treasury/e2e-configs/:id
POST   /treasury/e2e-configs/:id/validate
GET    /treasury/e2e-configs/active/runner-env
```

RBAC:

```ts
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@RequireRoles(UserRole.ADMIN, UserRole.FINANCE_MANAGER)
@RequirePermissions(Permission.TREASURY_E2E_CONFIG_MANAGE)
```

Lưu ý endpoint `active/runner-env`:

- Nếu gọi từ UI: không trả secret plaintext.
- Nếu gọi từ local script/scheduler: cần cơ chế nội bộ an toàn hơn JWT user thường, ví dụ:
  - chạy trong process NestJS và đọc trực tiếp service; hoặc
  - endpoint internal chỉ mở bằng `TREASURY_RUNNER_INTERNAL_TOKEN`; hoặc
  - CLI script bootstrap Nest app và query repository/service trực tiếp.

Khuyến nghị kỹ thuật: script TypeScript `daily-testnet-deposit-withdraw-e2e.ts` nên bootstrap Nest application context để đọc service DB trực tiếp, tránh tạo endpoint trả secret ra network.

### 3.4 Data model đề xuất

Tạo entity riêng để rõ ownership thay vì nhét toàn bộ vào `app_settings`.

Tên bảng đề xuất: `treasury_e2e_configs`.

Columns:

```text
treasury_e2e_config_id char(36) PK
environment varchar(32) not null              -- development/staging/ci/production
display_name varchar(128) not null
api_base_url varchar(512) not null
chain enum/string not null                    -- dùng BlockchainNetwork/BLOCKCHAIN_CHAIN_DB_VALUES nếu đã có
linked_wallet_id char(36) null
withdraw_amount_auto decimal(36,18) not null
withdraw_amount_manual decimal(36,18) not null
deposit_tx_hash varchar(255) null
deposit_amount decimal(36,18) null
allow_skip boolean not null default true
health_fail_on_critical boolean not null default false
stale_manual_minutes int unsigned not null default 15
stale_confirming_minutes int unsigned not null default 30
failed_withdrawals_24h int unsigned not null default 10
reconcile_pair_limit int unsigned not null default 100
reconciliation_threshold decimal(36,18) not null default 0.001
encrypted_secrets text null                   -- JSON encrypted: traderBearerToken, riskBearerToken, optional runner token
config_version int unsigned not null default 1
status enum('ACTIVE','INACTIVE','ARCHIVED') not null default 'INACTIVE'
created_by char(36) not null
updated_by char(36) not null
created_at timestamp
updated_at timestamp
activated_at timestamp null
archived_at timestamp null
```

Index/constraint:

```text
idx_treasury_e2e_env_status(environment, status)
idx_treasury_e2e_chain(chain)
idx_treasury_e2e_updated(updated_at)
```

Business invariant:

- Chỉ có 1 config `ACTIVE` cho mỗi `environment`.
- Không cho activate nếu thiếu required fields khi `allow_skip=false`.
- Nếu `deposit_tx_hash` có giá trị thì `deposit_amount` phải có giá trị, và ngược lại.
- `withdraw_amount_auto` phải nhỏ hơn hoặc bằng ngưỡng auto-approve thực tế nếu hệ thống có config ngưỡng rút tự động.
- `withdraw_amount_manual` phải lớn hơn ngưỡng auto-approve để thật sự test manual review.
- `chain` phải thuộc danh sách network được hỗ trợ bởi treasury/testnet.

### 3.5 Secrets shape

`encrypted_secrets` sau giải mã:

```json
{
  "traderBearerToken": "...",
  "riskBearerToken": "..."
}
```

Khuyến nghị tốt hơn bearer token tĩnh:

- Phase 1: lưu bearer token mã hóa để migration nhanh từ env hiện tại.
- Phase 2: thay bằng test user identity + token minting flow:
  - chọn `trader_user_id`, `risk_user_id` từ seed/test accounts;
  - runner gọi auth service nội bộ để tạo short-lived token lúc chạy;
  - không lưu long-lived bearer token trong DB.

### 3.6 Mapping từ env cũ sang DB

| Env cũ | DB field mới | Ghi chú |
|---|---|---|
| `E2E_API_BASE_URL` | `api_base_url` | Default dev `http://127.0.0.1:3000` |
| `E2E_BEARER_TOKEN_TRADER` | `encrypted_secrets.traderBearerToken` | Mask trên UI |
| `E2E_BEARER_TOKEN_RISK` | `encrypted_secrets.riskBearerToken` | Mask trên UI |
| `E2E_CHAIN` | `chain` | Cần validate với enum chain hiện có |
| `E2E_LINKED_WALLET_ID` | `linked_wallet_id` | Validate tồn tại nếu strict |
| `E2E_WITHDRAW_AMOUNT_AUTO` | `withdraw_amount_auto` | Decimal string |
| `E2E_WITHDRAW_AMOUNT_MANUAL` | `withdraw_amount_manual` | Decimal string |
| `E2E_DEPOSIT_TX_HASH` | `deposit_tx_hash` | Optional |
| `E2E_DEPOSIT_AMOUNT` | `deposit_amount` | Optional |
| `TREASURY_E2E_ALLOW_SKIP` | `allow_skip` | Boolean |
| `TREASURY_HEALTH_FAIL_ON_CRITICAL` | `health_fail_on_critical` | Boolean |
| `TREASURY_ALERT_STALE_MANUAL_MINUTES` | `stale_manual_minutes` | Đưa về cùng config |
| `TREASURY_ALERT_STALE_CONFIRMING_MINUTES` | `stale_confirming_minutes` | Đưa về cùng config |
| `TREASURY_ALERT_FAILED_WITHDRAWALS_24H` | `failed_withdrawals_24h` | Đưa về cùng config |
| `TREASURY_RECONCILE_PAIR_LIMIT` | `reconcile_pair_limit` | Đưa về cùng config |
| `WALLET_RECONCILIATION_THRESHOLD` | `reconciliation_threshold` hoặc giữ `system_configs` | Cần quyết định source of truth |

---

## 4. Required code changes

### 4.1 Backend

1. **Entity + migration**
   - Thêm `TreasuryE2EConfig` entity.
   - Migration tạo bảng `treasury_e2e_configs`.
   - Migration seed config dev mặc định từ values hiện tại nhưng không seed token thật.

2. **DTO validation**
   - `CreateTreasuryE2EConfigDto`
   - `UpdateTreasuryE2EConfigDto`
   - `ActivateTreasuryE2EConfigDto`
   - Validate URL, enum chain, decimal amount, boolean flags, relationship `deposit_tx_hash/deposit_amount`.

3. **Repository/service/use-cases**
   - `TreasuryE2EConfigRepository`
   - `GetTreasuryE2EConfigsQuery`
   - `CreateTreasuryE2EConfigUseCase`
   - `UpdateTreasuryE2EConfigUseCase`
   - `ActivateTreasuryE2EConfigUseCase`
   - `Deactivate/ArchiveTreasuryE2EConfigUseCase`
   - `ResolveTreasuryRunnerConfigService` để runner đọc config active.

4. **Encryption**
   - Dùng lại `wallet-encryption.service` hoặc pattern mã hóa đang dùng cho `PaymentMethodConfig.encrypted_config`.
   - Không trả `encrypted_secrets` raw qua API.

5. **RBAC**
   - Thêm permission `TREASURY_E2E_CONFIG_MANAGE`.
   - Gán permission cho `ADMIN` và `FINANCE_MANAGER` trong seed/permission mapping hiện có.

6. **Script integration**
   - Cập nhật `scripts/daily-testnet-deposit-withdraw-e2e.ts`:
     - thử đọc active config từ DB/service trước;
     - fallback env nếu DB chưa có config hoặc biến `TREASURY_E2E_CONFIG_SOURCE=env`.
   - Cập nhật `scripts/daily-treasury-health-check.ts`:
     - đọc threshold từ DB config active hoặc `system_configs` theo quyết định source of truth;
     - fallback env/default như hiện tại.
   - Cập nhật `scripts/run-treasury-daily.ps1`:
     - file env chỉ còn dùng bootstrap DB connection hoặc override dev;
     - không yêu cầu toàn bộ E2E inputs trong env.

7. **Docs**
   - Cập nhật `docs/TREASURY_DAILY_RUNBOOK.md`.
   - Cập nhật `scripts/treasury-e2e.env.example` thành legacy/bootstrap-only hoặc ghi rõ deprecated.

### 4.2 Frontend Flutter

1. **Feature folder**
   - Đề xuất: `lib/features/admin/treasury_e2e_config/...`
   - Hoặc đặt trong `lib/features/admin/payment_config/...` nếu muốn cùng module UI với cấu hình thanh toán.

2. **Data layer**
   - Datasource gọi API mới.
   - Model request/response.
   - Error mapping cho validation/security.

3. **Presentation**
   - Screen list cấu hình.
   - Dialog/page tạo/sửa.
   - Secret fields: không hiển thị plaintext token cũ; checkbox/button “Replace token”.
   - Status chips: ACTIVE/INACTIVE/ARCHIVED.
   - Confirm dialog khi activate/deactivate/archive.
   - Validate client-side trước khi submit nhưng BE vẫn validate lại.

4. **Navigation/RBAC UI**
   - Chỉ hiện menu/tab cho user có role `ADMIN` hoặc `FINANCE_MANAGER` và permission tương ứng.

---

## 5. Migration/rollout plan

### Phase 0 — Chuẩn hóa plan và quyết định policy

- Chốt tên permission.
- Chốt source of truth cho health thresholds: bảng mới hay `system_configs`.
- Chốt bearer token tĩnh phase 1 hay chuyển thẳng sang short-lived token minting.

### Phase 1 — DB + BE API

- Tạo migration/entity/repository/service.
- Thêm endpoints CRUD + activate/deactivate.
- Thêm encryption/masking secrets.
- Thêm RBAC permission.
- Test unit/service/controller.

### Phase 2 — Runner đọc DB với fallback env

- Cập nhật E2E script đọc DB active config.
- Cập nhật health script đọc DB active config.
- Giữ env fallback để không phá scheduler hiện tại.
- Log rõ source đang dùng: `db`, `env`, hoặc `default`, nhưng không log secrets.

### Phase 3 — UI cho FINANCE_MANAGER

- Tạo màn hình/tabs quản lý cấu hình.
- Tích hợp API list/detail/create/update/activate/deactivate/validate.
- Thêm UX mask/replace secret.

### Phase 4 — Deprecate env E2E đầy đủ

- Cập nhật runbook: env file chỉ dùng bootstrap/override khẩn cấp.
- `treasury-e2e.env.example` chuyển sang:
  - DB connection/runtime bootstrap nếu cần;
  - `TREASURY_E2E_CONFIG_SOURCE=db|env`;
  - không khuyến khích lưu bearer token plaintext.

### Phase 5 — Hardening

- Thay bearer token tĩnh bằng short-lived token minting từ test identities.
- Thêm audit event/outbox nếu hệ thống có audit module.
- Thêm approval workflow nếu production/staging cần maker-checker.

---

## 6. NON-GOALS

- Không thay đổi logic nghiệp vụ withdraw/deposit hiện tại.
- Không thay đổi quy trình phê duyệt rút tiền manual review.
- Không lưu private key ví treasury trong cấu hình E2E này; private key vẫn thuộc payment/managed wallet config hiện có.
- Không bắt buộc bỏ hoàn toàn env ngay phase đầu; env vẫn là fallback trong rollout.
- Không mở quyền sửa cấu hình này cho `TRADER`, `SUPPORT_AGENT`, hoặc `RISK_OFFICER` mặc định.

---

## 7. OPEN QUESTIONS

1. Có muốn dùng permission riêng `treasury_e2e_config:manage` hay tái sử dụng `payment_configs:manage`?
2. `WALLET_RECONCILIATION_THRESHOLD` nên giữ trong `system_configs` hay chuyển vào `treasury_e2e_configs` để cùng một màn hình quản lý?
3. Runner nên đọc DB bằng Nest application context trực tiếp hay qua internal API?
4. Bearer token test có thể được thay bằng cơ chế login/mint short-lived token không?
5. Có cần approval 2 bước cho thay đổi cấu hình ở staging/production không?
6. Có cần lưu nhiều cấu hình active theo environment + chain, hay chỉ 1 active per environment?
7. `linked_wallet_id` nên nhập tay hay UI chọn từ danh sách linked wallets hợp lệ theo trader test account?

---

## 8. Acceptance criteria

- `FINANCE_MANAGER` đăng nhập UI thấy tab quản lý cấu hình Treasury E2E.
- `FINANCE_MANAGER` tạo/sửa/activate/deactivate được config hợp lệ.
- `TRADER`/`SUPPORT_AGENT` không truy cập được API/UI config.
- API list/detail không leak bearer token plaintext.
- Runner `treasury:e2e` đọc được config active từ DB và chạy tương đương env cũ.
- Nếu DB chưa có config và `allow_skip=true`, dev run không fail cứng.
- Nếu strict mode (`allow_skip=false`, `health_fail_on_critical=true`) và thiếu required config, script fail rõ lý do.
- Thay đổi config có audit `updated_by/updated_at`.
- Runbook được cập nhật để không hướng dẫn lưu token thật trong `treasury-e2e.env` lâu dài.

---

## 9. Handoff

Trạng thái: **cần architecture/security review ngắn trước khi implement** vì có xử lý bearer token/secrets và runner access path.

Thứ tự triển khai đề xuất:

1. BE DB/API/RBAC/encryption.
2. Runner đọc DB fallback env.
3. FE UI tab cho `FINANCE_MANAGER`.
4. Docs + deprecate env full config.
5. Hardening token minting/audit/approval nếu cần.
