# WalletConnect & Reown — đăng nhập và liên kết ví

Tài liệu **duy nhất** mô tả luồng WalletConnect v2 / Reown: Flutter + NestJS, biến môi trường FE & BE, API. Mọi route REST dưới prefix **`/api/v1`**.

---

## Project ID (Reown Cloud)

- Tạo project tại [cloud.reown.com](https://cloud.reown.com/) (WalletConnect Cloud).
- **Cùng một giá trị** cho app production: đặt ở **cả** FE và BE (hai file `.env` độc lập, không chia sẻ file).

| Nơi | Biến | Khi nào cần |
|-----|------|-------------|
| **FE** `.env` | `WALLETCONNECT_PROJECT_ID` hoặc `REOWN_PROJECT_ID` | **Bắt buộc** cho **Reown AppKit** trên **Android/iOS** — SDK tạo URI/QR thật, pairing qua relay. |
| **BE** `.env` | `WALLETCONNECT_PROJECT_ID` hoặc `REOWN_PROJECT_ID` (cùng giá trị; BE lấy biến nào có trước) | **Bắt buộc** cho **desktop Sepolia tự động**: SignClient + relay thật. Thiếu **cả hai** → URI giả, QR không kết nối ví, chỉ còn **dán tay**. |
| Cả hai | (cùng ID) | Không bắt buộc riêng cho cặp **`/auth/wallet-nonce`** + **`/auth/wallet-verify`** nếu client đã ký xong; vẫn nên đồng bộ để một project trên dashboard và tránh nhầm relay. |

---

## Desktop native — `/auth/wallet/wc/*` + SignClient

Áp dụng **Flutter desktop** (Windows / macOS / Linux), chọn **Sepolia**, BE có **Project ID** (và biến đã qua whitelist — xem mục `env.validation.ts`):

1. **`POST /auth/wallet/wc/init`** — Nest `@walletconnect/sign-client`: URI relay thật, Redis, trả `relayPairing: true`, `caip2Chain`, … Nền: sau khi ví approve → **`personal_sign`** (message UTF-8 → hex `0x…`) → lưu **`address`**, **`signature`**, `status`.
2. FE poll **`GET /auth/wallet/wc/status/:sessionId`** — đủ `signed` + `address`/`signature` thì **tự verify** (không bắt buộc dán tay).
3. **`POST /auth/wallet/wc/verify`** — contract cũ (`sessionId`, `chain`, `address`, `signature`).

**`relayPairing: false`:** thiếu project id trên BE hoặc không phải luồng relay Sepolia → URI không dùng được như QR relay; FE cảnh báo, chỉ **dán tay** (hoặc Solana tương tự).

**SDK 2.23+ / ví (ví dụ MetaMask):** `optionalNamespaces` chỉ **gợi ý** Sepolia; session WC có thể là **Ethereum Mainnet** (`eip155:1`). BE gửi `personal_sign` với **`chainId` khớp account trong session** (CAIP-2). **Đăng nhập** vẫn xác minh theo **`ETH_SEPOLIA`** + message trong Redis — `personal_sign` off-chain, cùng EOA + cùng message thì chữ ký hợp lệ.

**Timeout BE:** `SignClient.init` ~18s (lỗi → reset singleton); có timeout cho `personal_sign` / pairing trong `wallet-connect-auth.service.ts` (tránh treo HTTP).

**Redis:** `wc:auth:session:{sessionId}`. **Scale:** một replica hoặc sticky — xem mục **Scale ngang**.

---

## Đăng nhập bằng ví (chưa có JWT) — tổng quan

| Cách | Nền tảng | Ghi chú |
|------|-----------|--------|
| **Reown AppKit** | Android, iOS | `reown_appkit` → `personal_sign` → **`/auth/wallet-verify`**. |
| **Extension** | Flutter **Web** | MetaMask / TronLink. |
| **QR server `/auth/wallet/wc/*`** | Web (nâng cao), **desktop** | Chi tiết: mục **Desktop native** ở trên. |
| **Solana / thiếu project id BE** | Cùng endpoint | URI giả; dán address + signature. |

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
| POST | `/auth/wallet/wc/init` | Public | `wcUri`, `message`, `expiresIn`, `caip2Chain`, `relayPairing` (`true` = relay + SignClient Sepolia) |
| GET | `/auth/wallet/wc/status/:sessionId` | Public | `status`: `pending` → `connected` → `signed` hoặc `failed` / `expired`; có thể có `address`, `signature`, `message`, `wcUri` |
| POST | `/auth/wallet/wc/verify` | Public | Chữ ký hợp lệ → JWT |
| POST | `/blockchain/wallets/wc/init` | JWT | Session liên kết ví |
| GET | `/blockchain/wallets/wc/status/:sessionId` | JWT | Poll liên kết |
| POST | `/blockchain/wallets/wc/submit` | JWT | Gửi signature sau khi user ký |
| POST | `/blockchain/wallets/wc/relay-webhook` | Public | Callback relay (HMAC tùy chọn) |

---

## Scale ngang (nhiều replica Nest)

Luồng **Sign Client trên server** giữ **WebSocket tới relay** và trạng thái pairing/session **trong bộ nhớ process** (mặc định). Vì vậy:

- **Pha dev/staging:** chạy **một replica** cho API xử lý `/auth/wallet/wc/*`, hoặc **sticky session** tới cùng pod đã gọi `init`.
- **Sau này:** có thể dùng **KeyValueStorage Redis** cho `@walletconnect/core` + worker chuyên xử lý WC để nhiều instance an toàn hơn.

Nếu không: request `init` và poll `status` có thể rơi vào **instance khác** → session không khớp, QR / poll thất bại.

---

## POST `/auth/wallet/wc/init` chậm / timeout / log relay `JWT … not yet valid`

Relay so sánh `iat` của JWT với giờ thực. **Đồng hồ máy chạy Nest lệch** → relay đóng socket (code 3000) → kết nối SDK lỗi / chậm. **Bật đồng bộ thời gian (NTP)** trên OS chạy Nest; trên Windows kiểm tra **“Đồng bộ ngay”** và dịch vụ **Windows Time** — chỉ bật “tự động” nhưng **lần sync thành công quá cũ** vẫn có thể lệch. BE đã giới hạn thời gian chờ **`SignClient.init`** (~18s) và **pairing / `personal_sign`** trong service để trả lỗi thay vì im lặng đến khi client HTTP timeout.

---

## Biến môi trường phải qua `env.validation.ts` (Nest)

`ConfigModule` dùng `validateEnvironment`: chỉ các key nằm trong class **`EnvironmentVariables`** và mảng **`envVarKeys`** (`src/config/env.validation.ts`) mới được đưa vào object đã validate → **`ConfigService.get()`** mới đọc được từ `.env`.

Nếu thêm biến mới vào **`.env`** mà **không** khai báo tương ứng trong hai chỗ trên → biến **vô hiệu** (đã xảy ra với `WALLETCONNECT_*` trước khi bổ sung). Các key WalletConnect hiện có trong whitelist: `WALLETCONNECT_PROJECT_ID`, `REOWN_PROJECT_ID`, `WALLETCONNECT_RELAY_URL`, `WALLETCONNECT_WEBHOOK_SECRET`.

---

## Biến môi trường — Backend (`env.example`)

| Biến | Bắt buộc | Mô tả |
|------|-----------|--------|
| `WALLETCONNECT_PROJECT_ID` / `REOWN_PROJECT_ID` | Một trong hai bắt buộc cho desktop Sepolia tự động | Cùng project Reown Cloud; thiếu → URI giả. |
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

- Đăng nhập WC public: `src/modules/auth/wallet-connect-auth.service.ts`, `auth.controller.ts` (`wallet/wc/*`); factory: `src/modules/blockchain/wallet-connect/walletconnect-dapp-client.factory.ts`
- Whitelist env: `src/config/env.validation.ts` (`EnvironmentVariables` + `envVarKeys`)
- Liên kết WC (JWT): `src/modules/blockchain/wallet-connect/*` (flow khác; có thể tái dùng factory sau)

**Flutter (`fe-cryptocurrency-trading-app`)**

- Đăng nhập: `lib/presentation/widgets/wallet_connect_auth_login_dialog.dart` (`relayPairing`, poll auto-verify), `lib/data/datasources/auth_remote_datasource.dart` (`WcAuthInitResult` / `WcAuthStatusResult`), `lib/core/services/wallet_connect/reown_wallet_auth_config.dart`, `lib/core/utils/wallet_auth_handler.dart`
- Liên kết ví (BE-driven QR): `lib/presentation/screens/blockchain/widgets/link_wallet_dialog.dart`, `wc_qr_session_card.dart`, `wc_deeplink_launcher.dart`, `wc_session_poller.dart`, `blockchain_provider.dart`, `api_constants.dart` (`blockchainWc*`)

---

## Swagger

Khi `NODE_ENV !== production`: nhóm **auth** (WC login) và **blockchain** tại `/api/docs`.
