# Tích hợp Ví Đa Chuỗi (Tron + Solana + Sepolia ETH) cho Frontend (Flutter)

Dựa trên API Backend vừa hoàn thành, tài liệu này đề xuất phương án (Best Practice) để tích hợp Wallet Linking và Nạp/Rút on-chain vào Frontend Flutter.

## Tuân thủ chuẩn mực
- **Kiến trúc:** Clean Architecture (Domain - Data - Presentation) tương tự các phần đang có.
- **State Management:** [Provider](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain-provider.factory.ts#35-49) (ChangeNotifier) đồng nhất với dự án hiện tại ([wallets_provider.dart](file:///d:/Sources/cryptocurrency-trading-app/fe-cryptocurrency-trading-app/lib/presentation/providers/wallets_provider.dart), v.v.).
- **Mẫu thiết kế (Design Patterns):** Repository Pattern (Data/Domain layer), Strategy Pattern (xử lý gọi deep link/SDK của từng loại ví).
- **Nguyên tắc SOLID:** Tách biệt service API (`BlockchainRepository`) và logic state ([BlockchainProvider](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/interfaces/blockchain.interface.ts#36-56)).

---

## Thay Đổi Đề Xuất

### Phần 1: Domain / Models

Tạo các Entities mới trong `lib/domain/entities/blockchain/`:

1. **Enum (`blockchain_network.dart`, `linked_wallet_status.dart`, `onchain_tx_status.dart`)**
   - `BlockchainNetwork`: `TRON_NILE`, `TRON_SHASTA`, `SOLANA_DEVNET`, `ETH_SEPOLIA`
   - `LinkedWalletStatus`: `PENDING`, `VERIFIED`, `REVOKED`

2. **LinkedWallet (`linked_wallet.dart`)**
   - Chứa thông tin ví đã liên kết: `linkId`, [chain](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/config/app.config.ts#212-236), `address`, `label`, `status`, `linkedAt`.

3. **OnchainTransaction (`onchain_transaction.dart`)**
   - Model cho lịch sử nạp/rút: `txId`, [chain](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/config/app.config.ts#212-236), `type`, `txHash`, `fromAddress`, `toAddress`, `amount`, `status`.

4. **DTOs (`blockchain_dtos.dart`)**
   - `RequestLinkResponse` (`message`, `expiresIn`)
   - `VerifyLinkResponse`
   - `SubmitDepositRequest` / `RequestWithdrawalRequest`

---

### Phần 2: Data / Repository

Tạo Repository gọi API Backend thông qua `Dio`. Thư mục: `lib/data/repositories/blockchain_repository_impl.dart` và `lib/domain/repositories/blockchain_repository.dart`.

Các hàm API cần gọi:
- [requestLink(chain, address, label)](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/wallet-linking.service.ts#36-88)
- [verifyLink(chain, address, signature)](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain.controller.ts#85-91)
- [getLinkedWallets()](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain.controller.ts#103-106)
- [getLinkedWalletBalance(linkId)](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain.controller.ts#120-126)
- [unlinkWallet(linkId)](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain.controller.ts#140-146)
- [submitDeposit(chain, txHash, amount)](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain.controller.ts#162-168)
- [requestWithdrawal(chain, linkedWalletId, amount)](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain.controller.ts#182-188)
- [getTransactions(limit)](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/onchain-transfer.service.ts#259-309)

---

### Phần 3: State Management (Provider)

#### `lib/presentation/providers/blockchain_provider.dart`

Tạo [BlockchainProvider](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/interfaces/blockchain.interface.ts#36-56) kế thừa `ChangeNotifier` để quản lý:
- `List<LinkedWallet> linkedWallets`
- `List<OnchainTransaction> recentTransactions`
- Các hàm kết nối UI với API Repository `fetchLinkedWallets()`, `initiateWalletLink()`, `verifyWalletLink()`, [submitDeposit()](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain.controller.ts#162-168), [requestWithdrawal()](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain.controller.ts#182-188).
- Trạng thái loading và error để UI hiển thị dialog/snackbar.

---

### Phần 4: Tích hợp Ví (Ví Client / Deep Linking)

Để lấy chữ ký (signature) từ người dùng (MetaMask / Phantom / TronLink), ứng dụng Flutter (Mobile/Desktop) cần giao tiếp với ví client của họ. Đây là **giải pháp Best Practice**:

1. **MetaMask (EVM - Sepolia):**
   - Cài đặt package `walletconnect_flutter_v2`.
   - Sử dụng WalletConnect protocol để prompt user ký (EIP-191 `personal_sign`).

2. **Phantom (Solana):**
   - Sử dụng Deep Linking spec của Phantom (thông qua package `url_launcher`):
   - Mở URL: `phantom://ul/v1/signMessage?app_url=...&dapp_encryption_public_key=...&nonce=...&message=...` (Theo chuẩn doc của Phantom Flutter). Hoặc dùng package hỗ trợ sẵn.

3. **TronLink (Tron):**
   - Nếu ở dạng Mobile app, gọi deep link sang TronLink app (`tronlinkoutside://...` hoặc qua WalletConnect nếu thiết lập bridge).
   - *(Mocking Support)*: Ở môi trường Testnet/Demo, Provider sẽ hỗ trợ "phương án fallback", cho phép user nhập thẳng chữ ký (test mode) để dễ dàng demo flow mà không cần setup physical device.

**Kiến trúc:** Tạo `WalletService` interface và tạo các implementation `MetamaskWalletService`, `PhantomWalletService` để Abstract hóa quá trình gọi ví và lấy signature. (Strategy Pattern).

---

### Phần 5: UI Screens

Tạo giao diện trong thư mục `lib/presentation/screens/blockchain/`:

1. **`LinkedWalletsScreen` (Màn hình Quản lý ví liên kết)**
   - Hiển thị danh sách ví `VERIFIED` đã liên kết.
   - Nút `[+] Liên kết ví mới` -> Mở ra Modal chọn mạng (Tron/Solana/ETH).

2. **`LinkWalletDialog`**
   - **Bước 1:** Chọn mạng blockchain. Nhập địa chỉ ví.
   - **Bước 2 (FE gọi):** BE trả về mã `message` (nonce challenge).
   - **Bước 3 (Ký):** FE mở WalletConnect/Deep Link tới MetaMask/Phantom... User ấn ký.
   - **Bước 4:** Bắt Event trả về `signature`. FE gửi lên BE qua API `verify-link`. Thành công -> Đóng dialog, reload danh sách ví.

3. **`OnchainDepositScreen`**
   - Hướng dẫn user mở ví cá nhân gửi token đến địa chỉ deposit chung của sàn.
   - Form cho phép user dán `txHash` và `amount` đã gửi.
   - Gọi API [submitDeposit](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain.controller.ts#162-168) -> Chờ BE verify on-chain và cộng tiền.

4. **`OnchainWithdrawScreen`**
   - Combobox liệt kê các "Ví đã liên kết" của mạng tương ứng (chống rút nhầm).
   - Nhập số lượng (`amount`).
   - Gọi API [requestWithdrawal](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/blockchain.controller.ts#182-188) -> Tiền sẽ được trừ vào balance và đưa vào hàng đợi rút on-chain.

---

## Các Bước Triển Khai Tiếp Theo (Execution)

1. **Setup Dependencies:** Thêm plugin `url_launcher` hoặc `walletconnect_flutter_v2` (tuỳ mức độ sâu của tích hợp).
2. **Setup Domain/Data Layer:** Viết Models và Dio API request cho Blockchain endpoints.
3. **Setup Provider:** Viết [BlockchainProvider](file:///d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app/src/modules/blockchain/interfaces/blockchain.interface.ts#36-56) để quản lý state.
4. **Build UI:** Tạo các trang Quản lý ví, Nạp tiền (Submit Tx), và Rút tiền.
5. **Logic Liên kết (Link Flow):** Kết nối quá trình Request Nonce -> Ký -> Verify.
