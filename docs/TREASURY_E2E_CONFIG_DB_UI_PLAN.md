# Treasury E2E Config DB + UI Plan — Status Update

Cập nhật: 2026-04-27
Trạng thái tổng thể: **Done for core rollout**

## DONE

Các hạng mục chính đã hoàn thành:

- Chuyển cấu hình từ `scripts/treasury-e2e.env.example` sang bảng DB `treasury_e2e_configs`.
- Tạo backend module/API/UI cho `FINANCE_MANAGER` / `ADMIN` quản lý cấu hình Treasury E2E.
- Runner `treasury:e2e` và `treasury:health` ưu tiên đọc config từ DB, fallback env khi cần.
- Bổ sung RBAC permission riêng cho Treasury E2E config.
- Mã hóa secret trong DB và không leak plaintext qua list/detail API.
- UI có create/edit/list/activate/deactivate/archive.
- UI có validate config + test connection/test tokens theo step.
- UI có chọn trader test account + linked wallet theo chain để giảm nhầm lẫn.
- Runbook và `treasury-e2e.env.example` đã được cập nhật theo hướng DB-first.

## DEVIATED DECISIONS

Các quyết định triển khai khác với wording ban đầu nhưng hợp lý hơn về kỹ thuật/bảo mật:

1. **Không triển khai endpoint `GET /treasury/e2e-configs/active/runner-env`**
   - Quyết định thực tế: runner bootstrap Nest application context và đọc service/repository trực tiếp.
   - Lý do: tránh đưa secret runtime ra network surface.

2. **Permission naming thực tế**
   - Plan ban đầu dùng ví dụ `TREASURY_E2E_CONFIG_MANAGE`.
   - Triển khai thực tế dùng permission riêng: `treasury_e2e_configs:manage` / enum `TREASURY_E2E_CONFIGS_MANAGE`.

3. **Short-lived token minting theo identity được ưu tiên hơn token tĩnh**
   - UI/backend hiện ưu tiên chọn `trader_user_id` / `risk_user_id`.
   - Backend mint JWT ngắn hạn runtime từ identity này.
   - `encrypted_secrets` vẫn được giữ làm fallback legacy migration, không còn là hướng chính.

4. **Risk actor selection**
   - Thay vì chỉ lưu risk bearer token tĩnh, UI cho chọn risk reviewer identity để kiểm thử approve flow an toàn hơn.

## REMAINING HARDENING ITEMS

Các mục còn lại không chặn rollout core nhưng nên cân nhắc cho giai đoạn sau:

1. **Approval workflow cho staging/production**
   - Nếu cần maker-checker cho thay đổi config nhạy cảm, thêm bước proposed/approved.

2. **Dedicated audit read model / admin audit UI**
   - Hiện đã có audit outbox event cho mutation Treasury E2E config.
   - Có thể bổ sung màn hình audit log riêng để truy vấn thuận tiện hơn.

3. **Narrower token scopes / dedicated internal claims**
   - Hiện short-lived token minting tái dùng payload auth chuẩn từ identity test account.
   - Có thể tinh chỉnh thêm claim/scope riêng cho treasury automation/test runner nếu muốn khóa chặt hơn.

4. **Environment policy guards mạnh hơn**
   - Có thể thêm rule cứng chặn mainnet/production theo environment policy nếu tổ chức yêu cầu cao hơn.

## FINAL IMPLEMENTATION NOTES

- Core capability đã usable trong admin UI.
- Runner đã DB-first.
- Legacy env còn tồn tại như fallback migration path.
- Hướng dài hạn khuyến nghị: identity-based minting thay cho static bearer token storage.
