# WalletConnect & Reown — đăng nhập và liên kết ví

Tài liệu mô tả WalletConnect v2 / Reown cho **API NestJS**: route REST, SignClient, relay, biến môi trường **backend**. Phía ứng dụng khách (Reown AppKit, poll status, v.v.) có `.env` và mã nguồn riêng — không mô tả chi tiết trong tệp này. Mọi route REST dưới prefix **`/api/v1`**.

---

## Primary stack theo nền tảng (Flutter FE + API)

Mỗi môi trường client có **một** luồng / thư viện chính (desktop không dùng Reown AppKit Dart; web ưu tiên extension inject; mobile dùng Reown AppKit). Bảng dưới tóm tắt FE khách và API backend dùng chung.

| Môi trường | Thư viện / luồng **chính** | API backend liên quan |
|------------|----------------------------|------------------------|
| **Windows / Linux / macOS (Flutter desktop)** | Nest **`@walletconnect/sign-client`** + **Redis**; client QR + poll `/auth/wallet/wc/*` | `POST /auth/wallet/wc/init`, `GET /auth/wallet/wc/status/:id`, `POST /auth/wallet/wc/verify` |
| **Android / iOS** | Flutter **`reown_appkit`** (modal/QR); ký rồi gọi verify | `/auth/wallet-nonce`, `/auth/wallet-verify` (và tùy chọn luồng WC public như desktop) |
| **Flutter Web** | **Injected** MetaMask / TronLink (bridge JS) | `/auth/wallet-nonce`, `/auth/wallet-verify` |

---

## Project ID (Reown Cloud)

- Tạo project tại [cloud.reown.com](https://cloud.reown.com/) (WalletConnect Cloud).
- **Cùng một giá trị** cho app production: đặt ở **cả** ứng dụng khách và server API (hai file `.env` độc lập, không chia sẻ file).

| Nơi | Biến | Khi nào cần |
|-----|------|-------------|
| **Ứng dụng khách** `.env` | `WALLETCONNECT_PROJECT_ID` hoặc `REOWN_PROJECT_ID` | **Bắt buộc** cho **Reown AppKit** trên **Android/iOS** — SDK tạo URI/QR thật, pairing qua relay. |
| **Server API** `.env` | `WALLETCONNECT_PROJECT_ID` hoặc `REOWN_PROJECT_ID` (cùng giá trị; server lấy biến nào có trước) | **Bắt buộc** cho **desktop Sepolia tự động**: SignClient + relay thật. Thiếu **cả hai** → URI giả, QR không kết nối ví, chỉ còn **dán tay**. |
| Cả hai | (cùng ID) | Không bắt buộc riêng cho cặp **`/auth/wallet-nonce`** + **`/auth/wallet-verify`** nếu client đã ký xong; vẫn nên đồng bộ để một project trên dashboard và tránh nhầm relay. |

---

## Desktop native — `/auth/wallet/wc/*` + SignClient

Áp dụng **desktop native** (ví dụ Flutter Windows / macOS / Linux), chọn **Sepolia**, server có **Project ID** (và biến đã qua whitelist — xem mục `env.validation.ts`):

1. **`POST /auth/wallet/wc/init`** — Nest `@walletconnect/sign-client`: URI relay thật, Redis, trả `relayPairing: true`, `caip2Chain`, … Nền: sau khi ví approve → **`personal_sign`** (message UTF-8 → hex `0x…`) → lưu **`address`**, **`signature`**, `status`.
2. Ứng dụng khách poll **`GET /auth/wallet/wc/status/:sessionId`** — đủ `signed` + `address`/`signature` thì **tự verify** (không bắt buộc dán tay).
3. **`POST /auth/wallet/wc/verify`** — contract cũ (`sessionId`, `chain`, `address`, `signature`).

**`relayPairing: false`:** thiếu project id trên server hoặc không phải luồng relay Sepolia → URI không dùng được như QR relay; ứng dụng khách cảnh báo, chỉ **dán tay** (hoặc Solana tương tự).

**SDK 2.23+ / ví (ví dụ MetaMask):** `optionalNamespaces` chỉ **gợi ý** Sepolia; session WC có thể là **Ethereum Mainnet** (`eip155:1`). Server gửi `personal_sign` với **`chainId` khớp account trong session** (CAIP-2). **Đăng nhập** vẫn xác minh theo **`ETH_SEPOLIA`** + message trong Redis — `personal_sign` off-chain, cùng EOA + cùng message thì chữ ký hợp lệ.

**Timeout BE:** `SignClient.init` ~18s (lỗi → reset singleton); có timeout cho `personal_sign` / pairing trong `wallet-connect-auth.service.ts` (tránh treo HTTP).

**SignClient singleton & mutex:** Toàn process dùng **một** `SignClient` ([`walletconnect-dapp-client.factory.ts`](./../src/modules/blockchain/wallet-connect/walletconnect-dapp-client.factory.ts)). Mọi luồng `connect` → lưu Redis → chờ approve + ký + `disconnect` được **xếp hàng** qua [`wallet-connect-sign-client-gate.ts`](./../src/modules/blockchain/wallet-connect/wallet-connect-sign-client-gate.ts) (`withWalletConnectSignClientLock`) trong cả đăng nhập WC và liên kết ví — tránh race khi nhiều `POST .../wc/init` gần như đồng thời.

**Relay trễ & `unhandledRejection`:** Sau `disconnect`, relay đôi khi vẫn chuyển gói cho topic cũ; engine `@walletconnect/sign-client` có thể báo `No matching key. session topic doesn't exist` trong promise nội bộ SDK (không gắn với handler của Nest). [`main.ts`](./../src/main.ts) coi pattern đó là **WARN** và **không** gọi `process.exit(1)`; các rejection khác vẫn kết thúc process như trước.

**Redis:** `wc:auth:session:{sessionId}`. **Scale:** một replica hoặc sticky — xem mục **Scale ngang**.

---

## Đăng nhập bằng ví (chưa có JWT) — tổng quan

| Cách | Nền tảng | Ghi chú |
|------|-----------|--------|
| **Reown AppKit** | Android, iOS | `reown_appkit` → `personal_sign` → **`/auth/wallet-verify`**. |
| **Extension** | **Web** (ví dụ Flutter web) | MetaMask / TronLink. |
| **QR server `/auth/wallet/wc/*`** | Web (nâng cao), **desktop** | Chi tiết: mục **Desktop native** ở trên. |
| **Solana / thiếu project id BE** | Cùng endpoint | URI giả; dán address + signature. |

Tron không phải EVM: **Flutter web** vẫn liên kết Tron qua **TronLink extension** (challenge). **Desktop / native** (Windows, Android, iOS): **WalletConnect v2** với namespace `tron`, method **`tron_signMessage`** — QR scan bằng ví (ví dụ **TronLink mobile**).

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

Relay so sánh `iat` của JWT với giờ thực. **Đồng hồ máy chạy Nest lệch** → relay đóng socket (code 3000) → kết nối SDK lỗi / chậm. **Bật đồng bộ thời gian (NTP)** trên OS chạy Nest; trên Windows kiểm tra **“Đồng bộ ngay”** và dịch vụ **Windows Time** — chỉ bật “tự động” nhưng **lần sync thành công quá cũ** vẫn có thể lệch. Service đã giới hạn thời gian chờ **`SignClient.init`** (~18s) và **pairing / `personal_sign`** để trả lỗi thay vì im lặng đến khi client HTTP timeout.

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

## Mã nguồn tham chiếu (backend)

- Đăng nhập WC public: `src/modules/auth/wallet-connect-auth.service.ts`, `auth.controller.ts` (`wallet/wc/*`); factory: `src/modules/blockchain/wallet-connect/walletconnect-dapp-client.factory.ts`
- Whitelist env: `src/config/env.validation.ts` (`EnvironmentVariables` + `envVarKeys`)
- Liên kết WC (JWT): `src/modules/blockchain/wallet-connect/*` (flow khác; có thể tái dùng factory sau)

---

## Swagger

Khi `NODE_ENV !== production`: nhóm **auth** (WC login) và **blockchain** tại `/api/docs`.
