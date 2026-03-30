# WalletConnect & Reown — đăng nhập và liên kết ví

Tài liệu **duy nhất** mô tả luồng WalletConnect v2 / Reown: Flutter + NestJS, biến môi trường FE & BE, API. Mọi route REST dưới prefix **`/api/v1`**.

---

## Project ID (Reown Cloud)

- Tạo project tại [cloud.reown.com](https://cloud.reown.com/) (WalletConnect Cloud).
- **Cùng một giá trị** cho app production: đặt ở **cả** FE và BE (hai file `.env` độc lập, không chia sẻ file).

| Nơi | Biến | Khi nào cần |
|-----|------|-------------|
| **FE** `.env` | `WALLETCONNECT_PROJECT_ID` hoặc `REOWN_PROJECT_ID` | **Bắt buộc** cho **Reown AppKit** trên **Android/iOS** — SDK tạo URI/QR thật, pairing qua relay. |
| **BE** `.env` | `WALLETCONNECT_PROJECT_ID` | **Khuyến nghị** khi Nest **ghép URI `wc:`** (đăng nhập legacy + liên kết ví có JWT). Thiếu → log cảnh báo, URI có thể thiếu `projectId`. |
| Cả hai | (cùng ID) | Không bắt buộc riêng cho cặp **`/auth/wallet-nonce`** + **`/auth/wallet-verify`** nếu client đã ký xong; vẫn nên đồng bộ để một project trên dashboard và tránh nhầm relay. |

---

## Đăng nhập bằng ví (chưa có JWT)

| Cách | Nền tảng | Cơ chế |
|------|-----------|--------|
| **Reown AppKit** | Android, iOS | FE: `reown_appkit`, `reown_wallet_auth_config.dart`, `wallet_connect_auth_login_dialog.dart`. Sau kết nối: nonce → `personal_sign` → **`/auth/wallet-verify`**. |
| **Extension** | Flutter **Web** | MetaMask / TronLink trong dialog; ký qua bridge web. |
| **QR do BE tạo (legacy)** | Web (mục nâng cao), **desktop native**, hoặc khi không dùng Reown | **`POST /auth/wallet/wc/init`**, poll **`GET .../status/:sessionId`**, **`POST .../verify`** → JWT. Session Redis: `wc:auth:session:{sessionId}`. QR hiển thị bằng `qr_flutter` từ `wcUri`. |
| **Desktop Windows / Linux / macOS (app native)** | Không WebView cho `webview_flutter` | Reown **không** khởi tạo; dùng **legacy QR** hoặc email. |

Tron không phải EVM: trên web dùng **TronLink**, không gom chung luồng EVM WalletConnect.

---

## Liên kết ví (đã đăng nhập, có JWT)

1. **`POST /blockchain/wallets/wc/init`** — `sessionId`, `wcUri`, `expiresIn`.
2. Hiển thị QR / deep link từ `wcUri`.
3. **`GET /blockchain/wallets/wc/status/:sessionId`** — poll (~2s).
4. **`POST /blockchain/wallets/wc/submit`** — `address`, `signature`, `chain` → verify, tạo `linked_wallet`.

**Relay webhook (tùy chọn):** **`POST /blockchain/wallets/wc/relay-webhook`**. Nếu cấu hình `WALLETCONNECT_WEBHOOK_SECRET`, caller phải gửi HMAC đúng header (`X-WC-Signature` hoặc `X-Relay-Signature`). Secret này **không** lấy từ tab “Secret” AppKit trên dashboard Reown — chỉ dùng nếu bạn tự triển khai caller ký body.

---

## Liên kết cổ điển (không WC)

- `POST /blockchain/wallets/request-link`, `POST .../verify-link`, `GET .../wallets`, v.v. — xem Swagger nhóm **blockchain**.

---

## API tổng hợp

| Method | Path | Auth | Mô tả |
|--------|------|------|--------|
| POST | `/auth/wallet/wc/init` | Public | Session đăng nhập WC: `wcUri`, `message`, `expiresIn`, … |
| GET | `/auth/wallet/wc/status/:sessionId` | Public | Poll trạng thái session đăng nhập |
| POST | `/auth/wallet/wc/verify` | Public | Chữ ký hợp lệ → JWT |
| POST | `/blockchain/wallets/wc/init` | JWT | Session liên kết ví |
| GET | `/blockchain/wallets/wc/status/:sessionId` | JWT | Poll liên kết |
| POST | `/blockchain/wallets/wc/submit` | JWT | Gửi signature sau khi user ký |
| POST | `/blockchain/wallets/wc/relay-webhook` | Public | Callback relay (HMAC tùy chọn) |

---

## Biến môi trường — Backend (`env.example`)

| Biến | Bắt buộc | Mô tả |
|------|-----------|--------|
| `WALLETCONNECT_PROJECT_ID` | Khuyến nghị | Project ID Reown Cloud — gắn vào URI `wc:` do Nest tạo. |
| `WALLETCONNECT_RELAY_URL` | Tùy chọn | Mặc định `wss://relay.walletconnect.com` |
| `WALLETCONNECT_WEBHOOK_SECRET` | Tùy chọn | Verify HMAC cho `relay-webhook`; để trống nếu không có caller ký webhook. |

---

## Biến môi trường — Frontend (`fe-cryptocurrency-trading-app`)

| Biến | Mô tả |
|------|--------|
| `WALLETCONNECT_PROJECT_ID` hoặc `REOWN_PROJECT_ID` | Reown AppKit (mobile). Trùng **cùng project** với BE. |

---

## Mã nguồn tham chiếu

**Backend**

- Đăng nhập WC public: `src/modules/auth/wallet-connect-auth.service.ts`, `auth.controller.ts` (`wallet/wc/*`)
- Liên kết WC: `src/modules/blockchain/wallet-connect/*`

**Flutter (`fe-cryptocurrency-trading-app`)**

- Đăng nhập: `lib/presentation/widgets/wallet_connect_auth_login_dialog.dart`, `lib/core/services/wallet_connect/reown_wallet_auth_config.dart`, `lib/core/utils/wallet_auth_handler.dart`
- Liên kết ví (BE-driven QR): `lib/presentation/screens/blockchain/widgets/link_wallet_dialog.dart`, `wc_qr_session_card.dart`, `wc_deeplink_launcher.dart`, `wc_session_poller.dart`, `blockchain_provider.dart`, `api_constants.dart` (`blockchainWc*`)

---

## Swagger

Khi `NODE_ENV !== production`: nhóm **auth** (WC login) và **blockchain** tại `/api/docs`.
