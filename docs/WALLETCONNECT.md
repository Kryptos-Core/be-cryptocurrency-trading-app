# WalletConnect v2 — Liên kết ví (Universal Wallet Linking)

Tài liệu mô tả luồng **WalletConnect v2** đã tích hợp: backend NestJS + Flutter (WC-first trong dialog liên kết ví). Các route REST nằm dưới prefix **`/api/v1`**.

## Trạng thái triển khai (checklist)

| Phase | Nội dung | Trạng thái |
|-------|-----------|------------|
| **1 — Backend** | Module `wallet-connect`, `@walletconnect/sign-client` + `@walletconnect/core`, service/controller/DTO, biến môi trường | Hoàn thành |
| **2 — FE core** | Entities, `ApiConstants`, repository + `BlockchainRepositoryImpl`, `blockchain_provider` (session + methods) | Hoàn thành |
| **3 — FE UI** | `wc_qr_session_card`, `wc_deeplink_launcher`, `wc_session_poller`, refactor `link_wallet_dialog` (WC-first), test WC flow | Hoàn thành |
| **4 — Cleanup (tùy chọn)** | Xóa `wallet_extension_precheck_service.dart` / `windows_extension_precheck_card.dart` nếu không còn reference | Chưa bắt buộc |

## Lưu ý kiến trúc (Flutter & Tron)

- **Không cần Flutter WalletConnect SDK:** Kiến trúc **BE-driven** đủ — session WC được tạo và theo dõi hoàn toàn trên backend (`@walletconnect/sign-client`). Phía Flutter chỉ cần **`qr_flutter`** (đã có trong project) để hiển thị QR từ `wcUri`, cùng poll REST + deep link khi cần.
- **`walletconnect_flutter_v2` đã deprecated**; hướng thay thế phổ biến là **`reown_appkit`** — **ta không tích hợp** các SDK này vì không quản lý session WC trên client.
- **Tron (TRX / TRC-20):** Trên **web**, chuỗi Tron vẫn dùng **TronLink Extension** (hoặc luồng tương thích Tron) — **đúng thiết kế**: Tron **không phải EVM**, không dùng chung MetaMask/EVM WalletConnect như Ethereum.

## Luồng khuyến nghị (DApp)

1. **FE (đã đăng nhập)** gọi `POST /blockchain/wallets/wc/init` với `chain` → nhận `sessionId`, `wcUri`, `expiresIn`.
2. Hiển thị **QR** (desktop) hoặc **deep link** (mobile) từ `wcUri`.
3. **Poll** `GET /blockchain/wallets/wc/status/:sessionId` (ví dụ mỗi ~2s) cho đến khi session sẵn sàng nhận chữ ký.
4. Khi wallet đã ký (qua SDK / sự kiện WC trên client), **FE gọi** `POST /blockchain/wallets/wc/submit` với `sessionId`, `address`, `signature`, `chain` → backend verify on-chain và tạo `linked_wallet` (tái dùng `WalletLinkingService`).

Luồng **relay webhook** (`POST /blockchain/wallets/wc/relay-webhook`) là **tùy chọn**: dùng khi có dịch vụ POST callback và (nếu bật) chữ ký HMAC khớp `WALLETCONNECT_WEBHOOK_SECRET`. Xem mục biến môi trường bên dưới.

## API Backend

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| POST | `/api/v1/blockchain/wallets/wc/init` | JWT | Tạo session, trả URI cho QR/deep link |
| GET | `/api/v1/blockchain/wallets/wc/status/:sessionId` | JWT | Poll trạng thái session |
| POST | `/api/v1/blockchain/wallets/wc/submit` | JWT | Gửi signature sau khi user ký trên wallet |
| POST | `/api/v1/blockchain/wallets/wc/relay-webhook` | Public | Callback relay (tùy chọn); verify HMAC nếu có secret + header `X-WC-Signature` hoặc `X-Relay-Signature` |

Các route **cũ** (nonce + ký trực tiếp) vẫn dùng được: `request-link`, `verify-link`, … — xem [BLOCKCHAIN_API_PURPOSE.md](BLOCKCHAIN_API_PURPOSE.md).

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|------|-----------|--------|
| `WALLETCONNECT_PROJECT_ID` | Khuyến nghị | Project ID từ [Reown Cloud](https://cloud.reown.com/) (trước đây WalletConnect Cloud). Thiếu thì BE log cảnh báo. |
| `WALLETCONNECT_RELAY_URL` | Tùy chọn | Mặc định `wss://relay.walletconnect.com` |
| `WALLETCONNECT_WEBHOOK_SECRET` | Tùy chọn | Secret dùng chung để verify HMAC-SHA256 body webhook. **Không** lấy từ tab “Secret” Dashboard API / AppKit Auth trên Reown — chỉ có ý nghĩa nếu bên **gọi** `relay-webhook` ký đúng thuật toán và header. Để trống nếu chưa có caller: verify bị bỏ qua. |

Chi tiết các nhóm biến khác: [ENV_CONFIG_USAGE.md](ENV_CONFIG_USAGE.md).

## Mã nguồn tham chiếu (Backend)

- `src/modules/blockchain/wallet-connect/wallet-connect.module.ts`
- `src/modules/blockchain/wallet-connect/wallet-connect.service.ts`
- `src/modules/blockchain/wallet-connect/wallet-connect.controller.ts`
- `src/modules/blockchain/wallet-connect/dto/`
- Đăng ký trong `blockchain.module.ts`

## Mã nguồn tham chiếu (Flutter)

Repo **`fe-cryptocurrency-trading-app`**:

- `lib/presentation/screens/blockchain/widgets/link_wallet_dialog.dart` — WC-first
- `lib/presentation/screens/blockchain/widgets/wc_qr_session_card.dart`
- `lib/presentation/screens/blockchain/widgets/wc_deeplink_launcher.dart`
- `lib/presentation/screens/blockchain/widgets/wc_session_poller.dart`
- `lib/domain/entities/blockchain/wc_session_proposal.dart`, `wc_session_status.dart`
- API: `lib/core/constants/api_constants.dart` (`blockchainWcInit`, `blockchainWcStatus`, `blockchainWcSubmit`)
- `lib/data/repositories/blockchain_repository_impl.dart`, `lib/domain/repositories/blockchain_repository.dart`
- `lib/presentation/providers/blockchain_provider.dart`

## Swagger

Khi `NODE_ENV !== production`, xem nhóm **blockchain** tại `/api/docs`.
