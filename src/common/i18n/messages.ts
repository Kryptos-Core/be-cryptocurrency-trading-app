/**
 * Single source of truth for every user-facing string emitted by the BE.
 *
 * Every entry has both `en` and `vi` text. The boot-time check
 * `I18nService.validateCatalog()` fails the process if any key is missing a
 * locale. Interpolation uses `{varName}` placeholders; the I18nService
 * replaces them at render time using values from `context`.
 *
 * Adding a new entry:
 *   1. Add the code to `ErrorCode` in `src/common/errors/error-codes.enum.ts`.
 *   2. Add the matching entry below with both `en` and `vi`.
 *   3. Add the code to `docs/ERROR_CODES.md`.
 *   4. Notify the FE team to mirror the entry into their ARB catalog.
 */
import { ErrorCode } from '../errors/error-codes.enum';

export type Locale = 'en' | 'vi';

export interface ErrorEntry {
  code: ErrorCode;
  statusCode: number;
  en: string;
  vi: string;
  /** Optional interpolation variable names. Enforced for documentation only. */
  vars?: readonly string[];
}

export interface MsgEntry {
  /** camelCase key, used for `translate('key', locale, vars)`. */
  key: string;
  en: string;
  vi: string;
  vars?: readonly string[];
}

export const ERROR_MESSAGES: Record<string, ErrorEntry> = {
  // ─── Generic ──────────────────────────────────────────────────────────
  [ErrorCode.BAD_REQUEST]: {
    code: ErrorCode.BAD_REQUEST,
    statusCode: 400,
    en: 'Bad request.',
    vi: 'Yêu cầu không hợp lệ.',
  },
  [ErrorCode.UNAUTHORIZED]: {
    code: ErrorCode.UNAUTHORIZED,
    statusCode: 401,
    en: 'Unauthorized.',
    vi: 'Chưa xác thực.',
  },
  [ErrorCode.FORBIDDEN]: {
    code: ErrorCode.FORBIDDEN,
    statusCode: 403,
    en: 'Forbidden.',
    vi: 'Bị từ chối truy cập.',
  },
  [ErrorCode.NOT_FOUND]: {
    code: ErrorCode.NOT_FOUND,
    statusCode: 404,
    en: 'Resource not found.',
    vi: 'Không tìm thấy tài nguyên.',
  },
  [ErrorCode.CONFLICT]: {
    code: ErrorCode.CONFLICT,
    statusCode: 409,
    en: 'Conflict.',
    vi: 'Xung đột dữ liệu.',
  },
  [ErrorCode.VALIDATION_ERROR]: {
    code: ErrorCode.VALIDATION_ERROR,
    statusCode: 422,
    en: 'Validation failed.',
    vi: 'Dữ liệu không hợp lệ.',
  },
  [ErrorCode.BUSINESS_ERROR]: {
    code: ErrorCode.BUSINESS_ERROR,
    statusCode: 400,
    en: 'Business rule violation.',
    vi: 'Vi phạm quy tắc nghiệp vụ.',
  },
  [ErrorCode.INTERNAL_SERVER_ERROR]: {
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    statusCode: 500,
    en: 'Internal server error.',
    vi: 'Lỗi máy chủ nội bộ.',
  },
  [ErrorCode.SERVICE_UNAVAILABLE]: {
    code: ErrorCode.SERVICE_UNAVAILABLE,
    statusCode: 503,
    en: 'Service temporarily unavailable.',
    vi: 'Dịch vụ tạm thời không khả dụng.',
  },

  // ─── Auth & users ─────────────────────────────────────────────────────
  [ErrorCode.EMAIL_EXISTS]: {
    code: ErrorCode.EMAIL_EXISTS,
    statusCode: 409,
    en: 'This email is already in use.',
    vi: 'Email này đã được sử dụng.',
  },
  [ErrorCode.INVALID_OTP]: {
    code: ErrorCode.INVALID_OTP,
    statusCode: 400,
    en: 'The OTP code is invalid or has expired.',
    vi: 'Mã OTP không hợp lệ hoặc đã hết hạn.',
  },
  [ErrorCode.OTP_REQUIRED]: {
    code: ErrorCode.OTP_REQUIRED,
    statusCode: 400,
    en: 'OTP code is required.',
    vi: 'Vui lòng nhập mã OTP.',
  },
  [ErrorCode.OTP_COOLDOWN]: {
    code: ErrorCode.OTP_COOLDOWN,
    statusCode: 400,
    en: 'Please wait {seconds} seconds before requesting another OTP.',
    vi: 'Vui lòng chờ {seconds} giây trước khi yêu cầu mã OTP mới.',
    vars: ['seconds'],
  },
  [ErrorCode.OTP_ATTEMPT_LIMIT_EXCEEDED]: {
    code: ErrorCode.OTP_ATTEMPT_LIMIT_EXCEEDED,
    statusCode: 400,
    en: 'Too many OTP attempts. Please try again in {seconds} seconds.',
    vi: 'Quá nhiều lần thử OTP. Vui lòng thử lại sau {seconds} giây.',
    vars: ['seconds'],
  },
  [ErrorCode.TWO_FA_REQUIRED]: {
    code: ErrorCode.TWO_FA_REQUIRED,
    statusCode: 400,
    en: 'Two-factor authentication is required. Please enable 2FA in Settings first.',
    vi: 'Vui lòng bật xác thực hai bước trong Cài đặt trước khi đổi mật khẩu.',
  },
  [ErrorCode.ACCOUNT_BANNED]: {
    code: ErrorCode.ACCOUNT_BANNED,
    statusCode: 400,
    en: 'Your account has been banned. Contact support.',
    vi: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ hỗ trợ.',
  },
  [ErrorCode.EMAIL_VERIFICATION_DISABLED]: {
    code: ErrorCode.EMAIL_VERIFICATION_DISABLED,
    statusCode: 400,
    en: 'Email verification is disabled by admin. OTP is not required.',
    vi: 'Xác minh email đã bị quản trị viên tắt. Không cần OTP.',
  },
  [ErrorCode.NOT_WALLET_PLACEHOLDER]: {
    code: ErrorCode.NOT_WALLET_PLACEHOLDER,
    statusCode: 400,
    en: 'Only wallet-placeholder accounts can use this flow. Use the regular email-change endpoint in Settings.',
    vi: 'Chỉ tài khoản đăng nhập ví (email tạm) mới dùng được bước này. Hãy dùng đổi email có xét duyệt trong Cài đặt.',
  },
  [ErrorCode.USE_CONTACT_EMAIL_VERIFICATION]: {
    code: ErrorCode.USE_CONTACT_EMAIL_VERIFICATION,
    statusCode: 400,
    en: 'Wallet accounts use a temporary email. Please verify a real email in Profile.',
    vi: 'Tài khoản ví dùng email tạm. Vui lòng xác minh email thật trong Hồ sơ.',
  },
  [ErrorCode.USE_CHANGE_PASSWORD_ENDPOINT]: {
    code: ErrorCode.USE_CHANGE_PASSWORD_ENDPOINT,
    statusCode: 400,
    en: 'Please use the dedicated change-password endpoint.',
    vi: 'Vui lòng dùng endpoint đổi mật khẩu chuyên dụng.',
  },
  [ErrorCode.INVALID_PAYLOAD]: {
    code: ErrorCode.INVALID_PAYLOAD,
    statusCode: 400,
    en: 'Request payload is invalid.',
    vi: 'Dữ liệu gửi lên không hợp lệ.',
  },
  [ErrorCode.INVALID_CHANGE_TYPE]: {
    code: ErrorCode.INVALID_CHANGE_TYPE,
    statusCode: 400,
    en: 'Unsupported change type.',
    vi: 'Loại thay đổi không được hỗ trợ.',
  },
  [ErrorCode.AVATAR_UPLOAD_DISABLED]: {
    code: ErrorCode.AVATAR_UPLOAD_DISABLED,
    statusCode: 400,
    en: 'Avatar upload is currently disabled.',
    vi: 'Tải lên ảnh đại diện đang bị tắt.',
  },
  [ErrorCode.CONTACT_EMAIL_REQUIRED]: {
    code: ErrorCode.CONTACT_EMAIL_REQUIRED,
    statusCode: 400,
    en: 'A contact email is required.',
    vi: 'Vui lòng nhập email liên hệ.',
  },
  [ErrorCode.INVALID_AVATAR_FORMAT]: {
    code: ErrorCode.INVALID_AVATAR_FORMAT,
    statusCode: 400,
    en: 'Only JPEG, PNG, or WebP images are allowed.',
    vi: 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.',
  },
  [ErrorCode.AVATAR_REQUIRED]: {
    code: ErrorCode.AVATAR_REQUIRED,
    statusCode: 400,
    en: 'Avatar file is required.',
    vi: 'Vui lòng chọn tệp ảnh đại diện.',
  },
  [ErrorCode.INVALID_USER]: {
    code: ErrorCode.INVALID_USER,
    statusCode: 400,
    en: 'Invalid user.',
    vi: 'Người dùng không hợp lệ.',
  },

  // ─── Withdrawals / onchain (user) ─────────────────────────────────────
  [ErrorCode.WITHDRAWAL_PROCESSING]: {
    code: ErrorCode.WITHDRAWAL_PROCESSING,
    statusCode: 409,
    en: 'A withdrawal is being processed.',
    vi: 'Yêu cầu rút tiền đang được xử lý.',
  },
  [ErrorCode.WITHDRAWAL_DUPLICATE]: {
    code: ErrorCode.WITHDRAWAL_DUPLICATE,
    statusCode: 409,
    en: 'Duplicate withdrawal request.',
    vi: 'Yêu cầu rút tiền bị gửi trùng.',
  },
  [ErrorCode.WITHDRAWAL_NOT_FOUND]: {
    code: ErrorCode.WITHDRAWAL_NOT_FOUND,
    statusCode: 409,
    en: 'Withdrawal not found.',
    vi: 'Không tìm thấy giao dịch rút tiền.',
  },
  [ErrorCode.WITHDRAWAL_PENDING_EXISTS]: {
    code: ErrorCode.WITHDRAWAL_PENDING_EXISTS,
    statusCode: 409,
    en: 'Cannot change email while {count} withdrawal(s) are pending. Please wait or cancel them first.',
    vi: 'Không thể thay đổi email khi có {count} yêu cầu rút tiền đang chờ xử lý. Vui lòng đợi hoặc hủy yêu cầu rút tiền trước.',
    vars: ['count'],
  },
  [ErrorCode.PENDING_WITHDRAWALS]: {
    code: ErrorCode.PENDING_WITHDRAWALS,
    statusCode: 400,
    en: 'Cannot perform this action while a withdrawal is pending.',
    vi: 'Không thể đổi email khi có lệnh rút tiền đang chờ xử lý. Vui lòng thử lại sau.',
  },
  [ErrorCode.USER_NOT_FOUND]: {
    code: ErrorCode.USER_NOT_FOUND,
    statusCode: 400,
    en: 'User not found.',
    vi: 'Không tìm thấy người dùng.',
  },
  [ErrorCode.WALLET_NOT_FOUND]: {
    code: ErrorCode.WALLET_NOT_FOUND,
    statusCode: 409,
    en: 'Withdrawal wallet not found.',
    vi: 'Không tìm thấy ví rút tiền.',
  },
  [ErrorCode.INVALID_AMOUNT]: {
    code: ErrorCode.INVALID_AMOUNT,
    statusCode: 400,
    en: 'Invalid amount.',
    vi: 'Số lượng không hợp lệ.',
  },
  [ErrorCode.INVALID_TARGET]: {
    code: ErrorCode.INVALID_TARGET,
    statusCode: 400,
    en: 'Cannot transfer to the same user.',
    vi: 'Không thể chuyển cho chính bạn.',
  },
  [ErrorCode.TARGET_REQUIRED]: {
    code: ErrorCode.TARGET_REQUIRED,
    statusCode: 400,
    en: 'targetUserId is required for transfers.',
    vi: 'Vui lòng chọn người nhận.',
  },
  [ErrorCode.INVALID_ACTION]: {
    code: ErrorCode.INVALID_ACTION,
    statusCode: 400,
    en: 'Invalid wallet action.',
    vi: 'Hành động ví không hợp lệ.',
  },
  [ErrorCode.INSUFFICIENT_BALANCE]: {
    code: ErrorCode.INSUFFICIENT_BALANCE,
    statusCode: 400,
    en: 'Insufficient balance.',
    vi: 'Số dư không đủ.',
  },
  [ErrorCode.ACCOUNT_FROZEN]: {
    code: ErrorCode.ACCOUNT_FROZEN,
    statusCode: 400,
    en: 'Account is frozen.',
    vi: 'Tài khoản đang bị đóng băng.',
  },
  [ErrorCode.CHAIN_REQUIRED]: {
    code: ErrorCode.CHAIN_REQUIRED,
    statusCode: 400,
    en: 'Missing query param: chain.',
    vi: 'Thiếu tham số chain.',
  },
  [ErrorCode.TX_HASH_REQUIRED]: {
    code: ErrorCode.TX_HASH_REQUIRED,
    statusCode: 400,
    en: 'Missing query param: txHash.',
    vi: 'Thiếu tham số txHash.',
  },
  [ErrorCode.ADMIN_INGEST_MISSING_PARAMS]: {
    code: ErrorCode.ADMIN_INGEST_MISSING_PARAMS,
    statusCode: 400,
    en: 'chain and txHash are required.',
    vi: 'chain và txHash là bắt buộc.',
  },
  [ErrorCode.INVALID_ADDRESS]: {
    code: ErrorCode.INVALID_ADDRESS,
    statusCode: 400,
    en: 'Invalid wallet address on chain {chain}.',
    vi: 'Địa chỉ ví không hợp lệ trên mạng {chain}.',
    vars: ['chain'],
  },
  [ErrorCode.INVALID_TRON_ADDRESS]: {
    code: ErrorCode.INVALID_TRON_ADDRESS,
    statusCode: 400,
    en: 'Invalid Tron destination address.',
    vi: 'Địa chỉ Tron không hợp lệ.',
  },
  [ErrorCode.INVALID_EVM_ADDRESS]: {
    code: ErrorCode.INVALID_EVM_ADDRESS,
    statusCode: 400,
    en: 'Invalid EVM destination address.',
    vi: 'Địa chỉ EVM không hợp lệ.',
  },
  [ErrorCode.INVALID_SIGNATURE]: {
    code: ErrorCode.INVALID_SIGNATURE,
    statusCode: 400,
    en: 'Signature is invalid.',
    vi: 'Chữ ký không hợp lệ.',
  },
  [ErrorCode.WALLET_ALREADY_LINKED]: {
    code: ErrorCode.WALLET_ALREADY_LINKED,
    statusCode: 409,
    en: 'This wallet is already linked to your account.',
    vi: 'Ví này đã được liên kết trước đó.',
  },
  [ErrorCode.WALLET_INACTIVE]: {
    code: ErrorCode.WALLET_INACTIVE,
    statusCode: 400,
    en: 'Inactive wallet cannot be set as default.',
    vi: 'Ví không hoạt động không thể làm mặc định.',
  },
  [ErrorCode.LINK_NOT_FOUND]: {
    code: ErrorCode.LINK_NOT_FOUND,
    statusCode: 400,
    en: 'Linked wallet not found.',
    vi: 'Không tìm thấy ví liên kết.',
  },
  [ErrorCode.WC_AUTH_SESSION_EXPIRED]: {
    code: ErrorCode.WC_AUTH_SESSION_EXPIRED,
    statusCode: 400,
    en: 'WalletConnect session expired. Please try again.',
    vi: 'Phiên WalletConnect đã hết hạn. Vui lòng thử lại.',
  },
  [ErrorCode.WC_AUTH_INVALID_PAYLOAD]: {
    code: ErrorCode.WC_AUTH_INVALID_PAYLOAD,
    statusCode: 400,
    en: 'Invalid WalletConnect payload.',
    vi: 'Dữ liệu WalletConnect không hợp lệ.',
  },

  // ─── Treasury / transaction wallets ───────────────────────────────────
  [ErrorCode.TREASURY_WALLET_BUSY]: {
    code: ErrorCode.TREASURY_WALLET_BUSY,
    statusCode: 400,
    en: 'Waiting for the previous treasury operation on this wallet to finish.',
    vi: 'Đang chờ thao tác ngân quỹ trước đó trên ví này hoàn tất.',
  },
  [ErrorCode.TREASURY_WALLET_BUSY_TIMEOUT]: {
    code: ErrorCode.TREASURY_WALLET_BUSY_TIMEOUT,
    statusCode: 400,
    en: 'Timed out waiting for the treasury wallet lock (over 15 minutes).',
    vi: 'Quá thời gian chờ khóa ví ngân quỹ (trên 15 phút).',
  },
  [ErrorCode.TREASURY_WALLET_INACTIVE]: {
    code: ErrorCode.TREASURY_WALLET_INACTIVE,
    statusCode: 400,
    en: 'This transaction wallet is inactive.',
    vi: 'Ví giao dịch ngân quỹ không hoạt động.',
  },
  [ErrorCode.TREASURY_WALLET_LOCKED]: {
    code: ErrorCode.TREASURY_WALLET_LOCKED,
    statusCode: 400,
    en: 'Another treasury operation is running on this wallet. Try again shortly.',
    vi: 'Một thao tác ngân quỹ khác đang chạy trên ví này. Vui lòng thử lại sau ít phút.',
  },
  [ErrorCode.TREASURY_CHAIN_UNSUPPORTED]: {
    code: ErrorCode.TREASURY_CHAIN_UNSUPPORTED,
    statusCode: 400,
    en: 'Unsupported treasury chain.',
    vi: 'Mạng ngân quỹ không được hỗ trợ.',
  },
  [ErrorCode.TREASURY_CHAIN_NOT_EVM]: {
    code: ErrorCode.TREASURY_CHAIN_NOT_EVM,
    statusCode: 400,
    en: 'Operation requires an EVM-compatible chain.',
    vi: 'Thao tác yêu cầu mạng tương thích EVM.',
  },
  [ErrorCode.TREASURY_INVALID_AMOUNT]: {
    code: ErrorCode.TREASURY_INVALID_AMOUNT,
    statusCode: 400,
    en: 'Amount must be greater than zero.',
    vi: 'Số lượng phải lớn hơn 0.',
  },
  [ErrorCode.TREASURY_SWEEP_USDT_ZERO]: {
    code: ErrorCode.TREASURY_SWEEP_USDT_ZERO,
    statusCode: 400,
    en: 'No USDT balance to sweep.',
    vi: 'Không có USDT để quét về.',
  },
  [ErrorCode.TREASURY_USDT_CHAIN]: {
    code: ErrorCode.TREASURY_USDT_CHAIN,
    statusCode: 400,
    en: 'USDT sweep requires a Tron chain.',
    vi: 'Quét USDT yêu cầu mạng Tron.',
  },
  [ErrorCode.TREASURY_CONFIRM_NO_WALLET]: {
    code: ErrorCode.TREASURY_CONFIRM_NO_WALLET,
    statusCode: 400,
    en: 'Missing to_wallet_id for confirm operation.',
    vi: 'Thiếu to_wallet_id cho thao tác xác nhận.',
  },
  [ErrorCode.TREASURY_MANUAL_SETTLE_TX_EMPTY]: {
    code: ErrorCode.TREASURY_MANUAL_SETTLE_TX_EMPTY,
    statusCode: 400,
    en: 'Transaction hash is required.',
    vi: 'Vui lòng nhập mã giao dịch.',
  },
  [ErrorCode.TREASURY_OPERATION_NOT_FOUND]: {
    code: ErrorCode.TREASURY_OPERATION_NOT_FOUND,
    statusCode: 404,
    en: 'Treasury operation not found.',
    vi: 'Không tìm thấy thao tác ngân quỹ.',
  },
  [ErrorCode.TREASURY_OPERATION_STATE_INVALID]: {
    code: ErrorCode.TREASURY_OPERATION_STATE_INVALID,
    statusCode: 400,
    en: 'Operation is in an invalid state for this action.',
    vi: 'Thao tác ngân quỹ đang ở trạng thái không hợp lệ cho hành động này.',
  },
  [ErrorCode.TREASURY_OPERATION_NOT_QUEUED]: {
    code: ErrorCode.TREASURY_OPERATION_NOT_QUEUED,
    statusCode: 400,
    en: 'Operation is not in the queued state.',
    vi: 'Thao tác không ở trạng thái chờ.',
  },
  [ErrorCode.TREASURY_OPERATION_NOT_PROCESSING]: {
    code: ErrorCode.TREASURY_OPERATION_NOT_PROCESSING,
    statusCode: 400,
    en: 'Operation is not being processed.',
    vi: 'Thao tác không đang xử lý.',
  },
  [ErrorCode.TREASURY_OPERATION_NOT_CONFIRMING]: {
    code: ErrorCode.TREASURY_OPERATION_NOT_CONFIRMING,
    statusCode: 400,
    en: 'Operation is not confirming on-chain.',
    vi: 'Thao tác không đang chờ xác nhận trên chuỗi.',
  },
  [ErrorCode.TREASURY_OPERATION_NOT_COMPLETED]: {
    code: ErrorCode.TREASURY_OPERATION_NOT_COMPLETED,
    statusCode: 400,
    en: 'Operation has not completed yet.',
    vi: 'Thao tác chưa hoàn tất.',
  },
  [ErrorCode.TREASURY_OPERATION_NOT_FAILED]: {
    code: ErrorCode.TREASURY_OPERATION_NOT_FAILED,
    statusCode: 400,
    en: 'Operation has not failed.',
    vi: 'Thao tác chưa thất bại.',
  },
  [ErrorCode.TREASURY_TX_HASH_NOT_FOUND]: {
    code: ErrorCode.TREASURY_TX_HASH_NOT_FOUND,
    statusCode: 404,
    en: 'Transaction hash not found in our records.',
    vi: 'Không tìm thấy giao dịch trong hệ thống.',
  },
  [ErrorCode.TREASURY_INSUFFICIENT_FUNDS]: {
    code: ErrorCode.TREASURY_INSUFFICIENT_FUNDS,
    statusCode: 400,
    en: 'Insufficient on-chain balance for this operation.',
    vi: 'Số dư trên chuỗi không đủ cho thao tác này.',
  },
  [ErrorCode.TREASURY_BALANCE_RECONCILE_FAILED]: {
    code: ErrorCode.TREASURY_BALANCE_RECONCILE_FAILED,
    statusCode: 500,
    en: 'Failed to reconcile treasury balance.',
    vi: 'Không thể đối chiếu số dư ngân quỹ.',
  },
  [ErrorCode.TREASURY_OPERATION_TYPE_UNSUPPORTED]: {
    code: ErrorCode.TREASURY_OPERATION_TYPE_UNSUPPORTED,
    statusCode: 400,
    en: 'Unsupported treasury operation type.',
    vi: 'Loại thao tác ngân quỹ không được hỗ trợ.',
  },
  [ErrorCode.TREASURY_RPC_UNAVAILABLE]: {
    code: ErrorCode.TREASURY_RPC_UNAVAILABLE,
    statusCode: 503,
    en: 'Blockchain RPC is unavailable. Please try again later.',
    vi: 'RPC blockchain không khả dụng. Vui lòng thử lại sau.',
  },
  [ErrorCode.TREASURY_RPC_TIMEOUT]: {
    code: ErrorCode.TREASURY_RPC_TIMEOUT,
    statusCode: 503,
    en: 'Blockchain RPC timed out. Please try again later.',
    vi: 'RPC blockchain quá thời gian. Vui lòng thử lại sau.',
  },
  [ErrorCode.TREASURY_GAS_ESTIMATE_FAILED]: {
    code: ErrorCode.TREASURY_GAS_ESTIMATE_FAILED,
    statusCode: 503,
    en: 'Could not estimate gas for the transaction.',
    vi: 'Không thể ước lượng gas cho giao dịch.',
  },
  [ErrorCode.TREASURY_NONCE_CONFLICT]: {
    code: ErrorCode.TREASURY_NONCE_CONFLICT,
    statusCode: 409,
    en: 'Nonce conflict. Another transaction is in flight for this wallet.',
    vi: 'Xung đột nonce. Có giao dịch khác đang chờ cho ví này.',
  },
  [ErrorCode.TREASURY_TX_REVERTED]: {
    code: ErrorCode.TREASURY_TX_REVERTED,
    statusCode: 400,
    en: 'On-chain transaction reverted.',
    vi: 'Giao dịch trên chuỗi đã bị revert.',
  },
  [ErrorCode.TREASURY_TX_BROADCAST_FAILED]: {
    code: ErrorCode.TREASURY_TX_BROADCAST_FAILED,
    statusCode: 503,
    en: 'Failed to broadcast transaction to the network.',
    vi: 'Không thể phát giao dịch lên mạng.',
  },
  [ErrorCode.TX_WALLET_EXISTS]: {
    code: ErrorCode.TX_WALLET_EXISTS,
    statusCode: 409,
    en: 'A transaction wallet with this chain and purpose already exists.',
    vi: 'Ví giao dịch với mạng và mục đích này đã tồn tại.',
  },
  [ErrorCode.TX_WALLET_NOT_FOUND]: {
    code: ErrorCode.TX_WALLET_NOT_FOUND,
    statusCode: 404,
    en: 'Transaction wallet not found.',
    vi: 'Không tìm thấy ví giao dịch.',
  },
  [ErrorCode.TX_WALLET_NON_ZERO_BALANCE]: {
    code: ErrorCode.TX_WALLET_NON_ZERO_BALANCE,
    statusCode: 400,
    en: 'Sweep funds first — on-chain balance must be at most {maxAmount} {symbol}.',
    vi: 'Hãy quét vốn trước — số dư trên chuỗi phải ≤ {maxAmount} {symbol}.',
    vars: ['maxAmount', 'symbol'],
  },
  [ErrorCode.TX_WALLET_USDT_NON_ZERO]: {
    code: ErrorCode.TX_WALLET_USDT_NON_ZERO,
    statusCode: 400,
    en: 'Move TRC-20 USDT off this wallet before deleting it.',
    vi: 'Chuyển hết USDT TRC-20 khỏi ví này trước khi xóa.',
  },
  [ErrorCode.TX_WALLET_DEFAULT_DEPOSIT_DELETE_FORBIDDEN]: {
    code: ErrorCode.TX_WALLET_DEFAULT_DEPOSIT_DELETE_FORBIDDEN,
    statusCode: 400,
    en: 'Unset this wallet as the user deposit default before deleting it.',
    vi: 'Bỏ đặt ví này làm ví nạp mặc định trước khi xóa.',
  },
  [ErrorCode.TX_WALLET_OPERATION_IN_FLIGHT]: {
    code: ErrorCode.TX_WALLET_OPERATION_IN_FLIGHT,
    statusCode: 400,
    en: 'Wait for pending Fund or Sweep operations to finish before deleting this wallet.',
    vi: 'Vui lòng đợi các thao tác Nạp hoặc Quét đang chờ hoàn tất trước khi xóa ví này.',
  },
  [ErrorCode.DEFAULT_USER_DEPOSIT_DEACTIVATE_FORBIDDEN]: {
    code: ErrorCode.DEFAULT_USER_DEPOSIT_DEACTIVATE_FORBIDDEN,
    statusCode: 400,
    en: 'You cannot deactivate the current default user deposit wallet.',
    vi: 'Không thể hủy kích hoạt ví nạp mặc định hiện tại.',
  },
  [ErrorCode.TRON_USDT_DESTINATION_NOT_ACTIVATED]: {
    code: ErrorCode.TRON_USDT_DESTINATION_NOT_ACTIVATED,
    statusCode: 400,
    en: 'The destination TRON wallet is not activated yet. Deposit TRX to that address before sending USDT.',
    vi: 'Ví TRON đích chưa được kích hoạt. Hãy nạp TRX vào địa chỉ đó trước khi gửi USDT.',
  },
  [ErrorCode.TRON_ACCOUNT_PREFLIGHT_UNAVAILABLE]: {
    code: ErrorCode.TRON_ACCOUNT_PREFLIGHT_UNAVAILABLE,
    statusCode: 503,
    en: 'Could not check the destination TRON wallet status right now. Please try again later.',
    vi: 'Không thể kiểm tra trạng thái ví TRON đích ngay bây giờ. Vui lòng thử lại sau.',
  },
  [ErrorCode.TREASURY_MAIN_WALLET_NOT_FOUND]: {
    code: ErrorCode.TREASURY_MAIN_WALLET_NOT_FOUND,
    statusCode: 404,
    en: 'Treasury main wallet not found.',
    vi: 'Không tìm thấy ví chính ngân quỹ.',
  },
  [ErrorCode.TREASURY_MAIN_WALLET_CONFLICT]: {
    code: ErrorCode.TREASURY_MAIN_WALLET_CONFLICT,
    statusCode: 409,
    en: 'A treasury main wallet with this configuration already exists.',
    vi: 'Ví chính ngân quỹ với cấu hình này đã tồn tại.',
  },

  // ─── Orders / matching ────────────────────────────────────────────────
  [ErrorCode.ORDER_NOT_FOUND]: {
    code: ErrorCode.ORDER_NOT_FOUND,
    statusCode: 404,
    en: 'Order not found.',
    vi: 'Không tìm thấy lệnh.',
  },
  [ErrorCode.ORDER_NOT_OPEN]: {
    code: ErrorCode.ORDER_NOT_OPEN,
    statusCode: 400,
    en: 'Order is not open.',
    vi: 'Lệnh không còn ở trạng thái mở.',
  },
  [ErrorCode.INVALID_PRICE]: {
    code: ErrorCode.INVALID_PRICE,
    statusCode: 400,
    en: 'Invalid price.',
    vi: 'Giá không hợp lệ.',
  },
  [ErrorCode.INVALID_INPUT]: {
    code: ErrorCode.INVALID_INPUT,
    statusCode: 400,
    en: 'Invalid order input.',
    vi: 'Dữ liệu lệnh không hợp lệ.',
  },
  [ErrorCode.INVALID_MARKET_BUY_RESERVE]: {
    code: ErrorCode.INVALID_MARKET_BUY_RESERVE,
    statusCode: 400,
    en: 'Invalid market buy reserve.',
    vi: 'Khoản dự trữ cho lệnh mua thị trường không hợp lệ.',
  },
  [ErrorCode.NO_LIQUIDITY]: {
    code: ErrorCode.NO_LIQUIDITY,
    statusCode: 400,
    en: 'Not enough liquidity for this order.',
    vi: 'Không đủ thanh khoản cho lệnh này.',
  },
  [ErrorCode.ORDER_CREATE_FAILED]: {
    code: ErrorCode.ORDER_CREATE_FAILED,
    statusCode: 400,
    en: 'Could not create order.',
    vi: 'Không thể tạo lệnh.',
  },
  [ErrorCode.INVALID_STATE]: {
    code: ErrorCode.INVALID_STATE,
    statusCode: 400,
    en: 'Order is in an invalid state.',
    vi: 'Lệnh đang ở trạng thái không hợp lệ.',
  },
  [ErrorCode.OVERFILL_ATTEMPT]: {
    code: ErrorCode.OVERFILL_ATTEMPT,
    statusCode: 400,
    en: 'Order would be overfilled.',
    vi: 'Lệnh sẽ bị khớp vượt quá số lượng cho phép.',
  },
  [ErrorCode.CANCEL_FAILED]: {
    code: ErrorCode.CANCEL_FAILED,
    statusCode: 400,
    en: 'Cancel failed.',
    vi: 'Hủy lệnh thất bại.',
  },
  [ErrorCode.PAIR_NOT_FOUND]: {
    code: ErrorCode.PAIR_NOT_FOUND,
    statusCode: 404,
    en: 'Trading pair not found.',
    vi: 'Không tìm thấy cặp giao dịch.',
  },
  [ErrorCode.INVALID_ORDER_TYPE]: {
    code: ErrorCode.INVALID_ORDER_TYPE,
    statusCode: 400,
    en: 'Invalid order type.',
    vi: 'Loại lệnh không hợp lệ.',
  },
  [ErrorCode.ORDER_BOOK_SERVICE_UNAVAILABLE]: {
    code: ErrorCode.ORDER_BOOK_SERVICE_UNAVAILABLE,
    statusCode: 503,
    en: 'Order book service is not available.',
    vi: 'Dịch vụ sổ lệnh không khả dụng.',
  },
  [ErrorCode.INVALID_DEPTH_LIMIT]: {
    code: ErrorCode.INVALID_DEPTH_LIMIT,
    statusCode: 400,
    en: 'Depth limit must be 5, 10, or 20.',
    vi: 'Giới hạn chiều sâu phải là 5, 10 hoặc 20.',
  },
  [ErrorCode.INVALID_INTERVAL]: {
    code: ErrorCode.INVALID_INTERVAL,
    statusCode: 400,
    en: 'Invalid interval.',
    vi: 'Khoảng thời gian không hợp lệ.',
  },
  [ErrorCode.MARKET_PAIR_SYMBOL_EXISTS]: {
    code: ErrorCode.MARKET_PAIR_SYMBOL_EXISTS,
    statusCode: 409,
    en: 'A market pair with this symbol already exists.',
    vi: 'Cặp thị trường với ký hiệu này đã tồn tại.',
  },
  [ErrorCode.BASE_QUOTE_SAME]: {
    code: ErrorCode.BASE_QUOTE_SAME,
    statusCode: 400,
    en: 'Base and quote currencies cannot be the same.',
    vi: 'Tiền tệ cơ sở và tiền tệ định giá phải khác nhau.',
  },
  [ErrorCode.BASE_QUOTE_REQUIRED]: {
    code: ErrorCode.BASE_QUOTE_REQUIRED,
    statusCode: 400,
    en: 'Base and quote currencies are required.',
    vi: 'Vui lòng chọn tiền tệ cơ sở và tiền tệ định giá.',
  },

  // ─── Markets / currencies ─────────────────────────────────────────────
  [ErrorCode.CURRENCY_NOT_FOUND]: {
    code: ErrorCode.CURRENCY_NOT_FOUND,
    statusCode: 404,
    en: 'Currency not found.',
    vi: 'Không tìm thấy tiền tệ.',
  },
  [ErrorCode.CURRENCY_SYMBOL_EXISTS]: {
    code: ErrorCode.CURRENCY_SYMBOL_EXISTS,
    statusCode: 409,
    en: 'A currency with this symbol already exists.',
    vi: 'Tiền tệ với ký hiệu này đã tồn tại.',
  },
  [ErrorCode.CURRENCY_DISABLED]: {
    code: ErrorCode.CURRENCY_DISABLED,
    statusCode: 400,
    en: 'Currency is disabled.',
    vi: 'Tiền tệ đang bị tắt.',
  },

  // ─── Market maker ─────────────────────────────────────────────────────
  [ErrorCode.MARKET_MAKER_CONFIG_NOT_FOUND]: {
    code: ErrorCode.MARKET_MAKER_CONFIG_NOT_FOUND,
    statusCode: 404,
    en: 'Market maker config not found.',
    vi: 'Không tìm thấy cấu hình market maker.',
  },
  [ErrorCode.MARKET_MAKER_CONFIG_CONFLICT]: {
    code: ErrorCode.MARKET_MAKER_CONFIG_CONFLICT,
    statusCode: 409,
    en: 'A market maker config for this user and pair already exists.',
    vi: 'Cấu hình market maker cho người dùng và cặp này đã tồn tại.',
  },
  [ErrorCode.MARKET_MAKER_INVALID_SPREAD]: {
    code: ErrorCode.MARKET_MAKER_INVALID_SPREAD,
    statusCode: 400,
    en: 'Invalid market maker spread.',
    vi: 'Spread market maker không hợp lệ.',
  },
  [ErrorCode.MARKET_MAKER_INVALID_AMOUNT]: {
    code: ErrorCode.MARKET_MAKER_INVALID_AMOUNT,
    statusCode: 400,
    en: 'Invalid market maker order amount.',
    vi: 'Khối lượng lệnh market maker không hợp lệ.',
  },
  [ErrorCode.MARKET_MAKER_NO_ACTIVE_PAIRS]: {
    code: ErrorCode.MARKET_MAKER_NO_ACTIVE_PAIRS,
    statusCode: 400,
    en: 'No active trading pairs configured for market making.',
    vi: 'Chưa cấu hình cặp giao dịch nào đang hoạt động cho market making.',
  },
  [ErrorCode.MARKET_MAKER_PLACE_FAILED]: {
    code: ErrorCode.MARKET_MAKER_PLACE_FAILED,
    statusCode: 400,
    en: 'Market maker could not place orders.',
    vi: 'Market maker không thể đặt lệnh.',
  },

  // ─── System config / admin authz ──────────────────────────────────────
  [ErrorCode.CONFIG_KEY_NOT_FOUND]: {
    code: ErrorCode.CONFIG_KEY_NOT_FOUND,
    statusCode: 404,
    en: 'Configuration key not found.',
    vi: 'Không tìm thấy khóa cấu hình.',
  },
  [ErrorCode.CONFIG_KEY_DISALLOWED]: {
    code: ErrorCode.CONFIG_KEY_DISALLOWED,
    statusCode: 400,
    en: 'This configuration key is not allowed.',
    vi: 'Khóa cấu hình này không được phép.',
  },
  [ErrorCode.CONFIG_KEY_READ_ONLY]: {
    code: ErrorCode.CONFIG_KEY_READ_ONLY,
    statusCode: 400,
    en: 'This configuration key is read-only.',
    vi: 'Khóa cấu hình này chỉ đọc.',
  },
  [ErrorCode.CONFIG_VALUE_INVALID]: {
    code: ErrorCode.CONFIG_VALUE_INVALID,
    statusCode: 400,
    en: 'Invalid value for configuration key.',
    vi: 'Giá trị không hợp lệ cho khóa cấu hình.',
  },
  [ErrorCode.ADMIN_REQUIRED]: {
    code: ErrorCode.ADMIN_REQUIRED,
    statusCode: 403,
    en: 'Admin role required.',
    vi: 'Yêu cầu quyền quản trị viên.',
  },
  [ErrorCode.RISK_OFFICER_REQUIRED]: {
    code: ErrorCode.RISK_OFFICER_REQUIRED,
    statusCode: 403,
    en: 'Risk officer role required.',
    vi: 'Yêu cầu quyền cán bộ rủi ro.',
  },
  [ErrorCode.FINANCE_MANAGER_REQUIRED]: {
    code: ErrorCode.FINANCE_MANAGER_REQUIRED,
    statusCode: 403,
    en: 'Finance manager role required.',
    vi: 'Yêu cầu quyền quản lý tài chính.',
  },

  // ─── Deposits ────────────────────────────────────────────────────────
  [ErrorCode.DEPOSIT_NOT_FOUND]: {
    code: ErrorCode.DEPOSIT_NOT_FOUND,
    statusCode: 404,
    en: 'Deposit not found.',
    vi: 'Không tìm thấy giao dịch nạp.',
  },
  [ErrorCode.DEPOSIT_ALREADY_PAID]: {
    code: ErrorCode.DEPOSIT_ALREADY_PAID,
    statusCode: 409,
    en: 'Deposit already paid or not found.',
    vi: 'Giao dịch nạp đã được thanh toán hoặc không tồn tại.',
  },
  [ErrorCode.DEPOSIT_AMOUNT_INVALID]: {
    code: ErrorCode.DEPOSIT_AMOUNT_INVALID,
    statusCode: 400,
    en: 'Invalid deposit amount.',
    vi: 'Số lượng nạp không hợp lệ.',
  },
  [ErrorCode.DEPOSIT_CHAIN_UNSUPPORTED]: {
    code: ErrorCode.DEPOSIT_CHAIN_UNSUPPORTED,
    statusCode: 400,
    en: 'Unsupported deposit chain.',
    vi: 'Mạng nạp không được hỗ trợ.',
  },
  [ErrorCode.DEPOSIT_POLL_FAILED]: {
    code: ErrorCode.DEPOSIT_POLL_FAILED,
    statusCode: 503,
    en: 'Could not check deposit status. Please try again later.',
    vi: 'Không thể kiểm tra trạng thái nạp. Vui lòng thử lại sau.',
  },
  [ErrorCode.TX_FAILED]: {
    code: ErrorCode.TX_FAILED,
    statusCode: 400,
    en: 'On-chain transaction failed.',
    vi: 'Giao dịch on-chain đã thất bại.',
  },

  // ─── Encryption / infra ──────────────────────────────────────────────
  [ErrorCode.ENCRYPTION_FAILED]: {
    code: ErrorCode.ENCRYPTION_FAILED,
    statusCode: 500,
    en: 'Encryption failed.',
    vi: 'Mã hóa thất bại.',
  },
  [ErrorCode.DECRYPTION_FAILED]: {
    code: ErrorCode.DECRYPTION_FAILED,
    statusCode: 500,
    en: 'Decryption failed.',
    vi: 'Giải mã thất bại.',
  },
  [ErrorCode.ENCRYPTED_PAYLOAD_MALFORMED]: {
    code: ErrorCode.ENCRYPTED_PAYLOAD_MALFORMED,
    statusCode: 500,
    en: 'Encrypted payload is malformed.',
    vi: 'Dữ liệu mã hóa bị lỗi.',
  },
  [ErrorCode.DECRYPTED_PAYLOAD_INVALID]: {
    code: ErrorCode.DECRYPTED_PAYLOAD_INVALID,
    statusCode: 500,
    en: 'Decrypted payload is invalid.',
    vi: 'Dữ liệu sau giải mã không hợp lệ.',
  },
  [ErrorCode.EXTERNAL_PROVIDER_UNAVAILABLE]: {
    code: ErrorCode.EXTERNAL_PROVIDER_UNAVAILABLE,
    statusCode: 503,
    en: 'External provider is unavailable.',
    vi: 'Nhà cung cấp bên ngoài không khả dụng.',
  },
  [ErrorCode.EXTERNAL_PROVIDER_RATE_LIMITED]: {
    code: ErrorCode.EXTERNAL_PROVIDER_RATE_LIMITED,
    statusCode: 503,
    en: 'External provider rate limit reached. Please try again later.',
    vi: 'Đã đạt giới hạn tốc độ của nhà cung cấp. Vui lòng thử lại sau.',
  },

  // ─── Notifications / push ────────────────────────────────────────────
  [ErrorCode.NOTIFICATION_DELIVERY_FAILED]: {
    code: ErrorCode.NOTIFICATION_DELIVERY_FAILED,
    statusCode: 503,
    en: 'Notification delivery failed.',
    vi: 'Gửi thông báo thất bại.',
  },
  [ErrorCode.FCM_NOT_CONFIGURED]: {
    code: ErrorCode.FCM_NOT_CONFIGURED,
    statusCode: 503,
    en: 'Push notifications are not configured.',
    vi: 'Thông báo đẩy chưa được cấu hình.',
  },

  // ─── Tron send ───────────────────────────────────────────────────────
  [ErrorCode.TRON_SEND_FAILED]: {
    code: ErrorCode.TRON_SEND_FAILED,
    statusCode: 400,
    en: 'Failed to submit Tron transaction.',
    vi: 'Không thể gửi giao dịch Tron.',
  },
};

/**
 * Validation messages indexed by the `class-validator` constraint name
 * (e.g. `minLength`, `isEmail`, `matches`). The global `ValidationPipe`
 * `exceptionFactory` consults this map before falling back to the
 * class-validator default English text.
 */
export const VALIDATION_MESSAGES: Record<string, MsgEntry> = {
  isEmail: { key: 'isEmail', en: 'Must be a valid email.', vi: 'Phải là email hợp lệ.' },
  isNotEmpty: { key: 'isNotEmpty', en: 'This field is required.', vi: 'Trường này là bắt buộc.' },
  minLength: { key: 'minLength', en: 'Must be at least {min} characters.', vi: 'Phải có ít nhất {min} ký tự.', vars: ['min'] },
  maxLength: { key: 'maxLength', en: 'Must be at most {max} characters.', vi: 'Không được quá {max} ký tự.', vars: ['max'] },
  min: { key: 'min', en: 'Must be at least {min}.', vi: 'Phải ít nhất {min}.', vars: ['min'] },
  max: { key: 'max', en: 'Must be at most {max}.', vi: 'Không được quá {max}.', vars: ['max'] },
  isInt: { key: 'isInt', en: 'Must be an integer.', vi: 'Phải là số nguyên.' },
  isNumber: { key: 'isNumber', en: 'Must be a number.', vi: 'Phải là số.' },
  isDecimal: { key: 'isDecimal', en: 'Must be a decimal.', vi: 'Phải là số thập phân.' },
  isPositive: { key: 'isPositive', en: 'Must be a positive number.', vi: 'Phải là số dương.' },
  isEnum: { key: 'isEnum', en: 'Must be one of the allowed values.', vi: 'Phải nằm trong các giá trị cho phép.' },
  isString: { key: 'isString', en: 'Must be a string.', vi: 'Phải là chuỗi.' },
  isBoolean: { key: 'isBoolean', en: 'Must be a boolean.', vi: 'Phải là boolean.' },
  isArray: { key: 'isArray', en: 'Must be an array.', vi: 'Phải là mảng.' },
  isUrl: { key: 'isUrl', en: 'Must be a valid URL.', vi: 'Phải là URL hợp lệ.' },
  isUUID: { key: 'isUUID', en: 'Must be a valid UUID.', vi: 'Phải là UUID hợp lệ.' },
  matches: { key: 'matches', en: 'Invalid format.', vi: 'Định dạng không hợp lệ.' },
  isIn: { key: 'isIn', en: 'Must be one of the allowed values.', vi: 'Phải nằm trong các giá trị cho phép.' },
  isOptional: { key: 'isOptional', en: '', vi: '' },
};

/** Per-field overrides used by DTO decorators that need bespoke copy. */
export const FIELD_VALIDATION_MESSAGES: Record<string, MsgEntry> = {
  passwordMinLength: { key: 'passwordMinLength', en: 'Password must be at least 8 characters.', vi: 'Mật khẩu phải có ít nhất 8 ký tự.' },
  passwordUppercase: { key: 'passwordUppercase', en: 'Password must contain at least one uppercase letter.', vi: 'Mật khẩu phải có ít nhất một chữ hoa.' },
  passwordNumber: { key: 'passwordNumber', en: 'Password must contain at least one number.', vi: 'Mật khẩu phải có ít nhất một chữ số.' },
  passwordSpecial: { key: 'passwordSpecial', en: 'Password must contain at least one special character.', vi: 'Mật khẩu phải có ít nhất một ký tự đặc biệt.' },
  confirmPasswordMatch: { key: 'confirmPasswordMatch', en: 'Passwords do not match.', vi: 'Mật khẩu xác nhận không khớp.' },
  otpLength: { key: 'otpLength', en: 'OTP must be 6 digits.', vi: 'Mã OTP phải có 6 chữ số.' },
  amountDecimal: { key: 'amountDecimal', en: 'Amount must be a valid decimal number with up to 18 decimals.', vi: 'Số lượng phải là số thập phân hợp lệ với tối đa 18 chữ số sau dấu phẩy.' },
  apiKeyRequired: { key: 'apiKeyRequired', en: 'API key is required.', vi: 'API key là bắt buộc.' },
  apiSecretRequired: { key: 'apiSecretRequired', en: 'API secret is required.', vi: 'API secret là bắt buộc.' },
  symbolPairFormat: { key: 'symbolPairFormat', en: 'Symbol must be in format BASE/QUOTE (e.g. BTC/USDT).', vi: 'Ký hiệu phải có dạng BASE/QUOTE (vd: BTC/USDT).' },
  marketBuySlippageRequired: { key: 'marketBuySlippageRequired', en: 'slippageTolerance is required for MARKET BUY orders.', vi: 'slippageTolerance là bắt buộc cho lệnh MARKET BUY.' },
};

/** Generic success messages returned to clients via the response interceptor. */
export const SUCCESS_MESSAGES: Record<string, MsgEntry> = {
  userDeleted: { key: 'userDeleted', en: 'User deleted successfully.', vi: 'Đã xóa người dùng.' },
  userUpdated: { key: 'userUpdated', en: 'User updated successfully.', vi: 'Đã cập nhật người dùng.' },
  userBanned: { key: 'userBanned', en: 'User banned.', vi: 'Đã khóa người dùng.' },
  userUnbanned: { key: 'userUnbanned', en: 'User unbanned.', vi: 'Đã mở khóa người dùng.' },
  avatarUploaded: { key: 'avatarUploaded', en: 'Avatar uploaded successfully.', vi: 'Đã cập nhật ảnh đại diện.' },
  passwordChanged: { key: 'passwordChanged', en: 'Password changed successfully.', vi: 'Đã đổi mật khẩu.' },
  otpSent: { key: 'otpSent', en: 'OTP sent.', vi: 'Đã gửi mã OTP.' },
  emailChanged: { key: 'emailChanged', en: 'Email updated.', vi: 'Đã cập nhật email.' },
  depositPaid: { key: 'depositPaid', en: 'Deposit successfully paid.', vi: 'Nạp tiền đã được ghi nhận.' },
  treasuryWalletCreated: { key: 'treasuryWalletCreated', en: 'Transaction wallet created.', vi: 'Đã tạo ví giao dịch.' },
  treasuryWalletDeleted: { key: 'treasuryWalletDeleted', en: 'Transaction wallet deleted.', vi: 'Đã xóa ví giao dịch.' },
  treasuryOperationRetried: { key: 'treasuryOperationRetried', en: 'Treasury operation retried.', vi: 'Đã thử lại thao tác ngân quỹ.' },
  treasuryOperationAborted: { key: 'treasuryOperationAborted', en: 'Treasury operation aborted.', vi: 'Đã hủy thao tác ngân quỹ.' },
  treasuryOperationSettled: { key: 'treasuryOperationSettled', en: 'Treasury operation confirmed.', vi: 'Đã xác nhận thao tác ngân quỹ.' },
  walletSetDefault: { key: 'walletSetDefault', en: 'Wallet set as default deposit address.', vi: 'Đã đặt ví làm địa chỉ nạp mặc định.' },
  walletDeactivated: { key: 'walletDeactivated', en: 'Wallet deactivated.', vi: 'Đã hủy kích hoạt ví.' },
  walletActivated: { key: 'walletActivated', en: 'Wallet activated.', vi: 'Đã kích hoạt ví.' },
  configUpdated: { key: 'configUpdated', en: 'Configuration updated.', vi: 'Đã cập nhật cấu hình.' },
  broadcastSent: { key: 'broadcastSent', en: 'Broadcast sent.', vi: 'Đã gửi thông báo broadcast.' },
  loggedOut: { key: 'loggedOut', en: 'Logged out.', vi: 'Đã đăng xuất.' },
  withdrawalRequested: { key: 'withdrawalRequested', en: 'Withdrawal request submitted.', vi: 'Đã gửi yêu cầu rút tiền.' },
  withdrawalApproved: { key: 'withdrawalApproved', en: 'Withdrawal approved.', vi: 'Đã duyệt yêu cầu rút tiền.' },
  withdrawalRejected: { key: 'withdrawalRejected', en: 'Withdrawal rejected.', vi: 'Đã từ chối yêu cầu rút tiền.' },
  orderPlaced: { key: 'orderPlaced', en: 'Order placed successfully.', vi: 'Đặt lệnh thành công.' },
  orderCancelled: { key: 'orderCancelled', en: 'Order cancelled.', vi: 'Đã hủy lệnh.' },
  marketPairCreated: { key: 'marketPairCreated', en: 'Market pair created.', vi: 'Đã tạo cặp thị trường.' },
  marketPairUpdated: { key: 'marketPairUpdated', en: 'Market pair updated.', vi: 'Đã cập nhật cặp thị trường.' },
  marketPairDeleted: { key: 'marketPairDeleted', en: 'Market pair deleted.', vi: 'Đã xóa cặp thị trường.' },
  currencyCreated: { key: 'currencyCreated', en: 'Currency created.', vi: 'Đã tạo tiền tệ.' },
  currencyUpdated: { key: 'currencyUpdated', en: 'Currency updated.', vi: 'Đã cập nhật tiền tệ.' },
  currencyDeleted: { key: 'currencyDeleted', en: 'Currency deleted.', vi: 'Đã xóa tiền tệ.' },
};

/** Email subjects + bodies. Variables rendered by I18nService. */
export const MAIL_MESSAGES: Record<string, MsgEntry> = {
  contactEmailOtpSubject: {
    key: 'contactEmailOtpSubject',
    en: 'Contact email verification',
    vi: 'Mã xác minh email liên hệ',
  },
  contactEmailOtpBody: {
    key: 'contactEmailOtpBody',
    en: 'Your verification code is: {code}. It expires in {minutes} minutes.',
    vi: 'Mã xác minh của bạn là: {code}. Mã có hiệu lực trong {minutes} phút.',
    vars: ['code', 'minutes'],
  },
  contactEmailOtpSubjectEn: {
    key: 'contactEmailOtpSubjectEn',
    en: 'Contact email verification',
    vi: 'Contact email verification',
  },
  contactEmailOtpBodyEn: {
    key: 'contactEmailOtpBodyEn',
    en: 'Your verification code is: {code}. It expires in {minutes} minutes.',
    vi: 'Your verification code is: {code}. It expires in {minutes} minutes.',
    vars: ['code', 'minutes'],
  },
  twoFactorOtpSubject: {
    key: 'twoFactorOtpSubject',
    en: 'Two-factor authentication code',
    vi: 'Mã OTP xác thực 2 bước',
  },
  twoFactorOtpBody: {
    key: 'twoFactorOtpBody',
    en: 'Your OTP code is: {code}. It expires in {minutes} minutes.',
    vi: 'Mã OTP của bạn là: {code}. Mã có hiệu lực trong {minutes} phút.',
    vars: ['code', 'minutes'],
  },
  emailChangeSubject: {
    key: 'emailChangeSubject',
    en: 'Email change notification',
    vi: 'Thông báo thay đổi email',
  },
  emailChangeSubjectEn: {
    key: 'emailChangeSubjectEn',
    en: 'Email change notification',
    vi: 'Email change notification',
  },
  emailChangeBody: {
    key: 'emailChangeBody',
    en: 'Your account email was changed from {oldEmail} to {newEmail}. If this was not you, please contact support immediately.',
    vi: 'Email tài khoản của bạn đã được đổi từ {oldEmail} sang {newEmail}. Nếu đây không phải bạn, vui lòng liên hệ hỗ trợ ngay.',
    vars: ['oldEmail', 'newEmail'],
  },
  emailChangeBodyEn: {
    key: 'emailChangeBodyEn',
    en: 'Your account email was changed from {oldEmail} to {newEmail}. If this was not you, please contact support immediately.',
    vi: 'Your account email was changed from {oldEmail} to {newEmail}. If this was not you, please contact support immediately.',
    vars: ['oldEmail', 'newEmail'],
  },
};

/** Push notification + in-app notification copy. */
export const NOTIFICATION_MESSAGES: Record<string, MsgEntry> = {
  withdrawalRequestedTitle: {
    key: 'withdrawalRequestedTitle',
    en: 'New withdrawal request',
    vi: 'Yêu cầu rút tiền mới',
  },
  withdrawalRequestedBody: {
    key: 'withdrawalRequestedBody',
    en: 'You requested a withdrawal of {amount} {symbol}.',
    vi: 'Bạn vừa yêu cầu rút {amount} {symbol}.',
    vars: ['amount', 'symbol'],
  },
  withdrawalApprovedTitle: {
    key: 'withdrawalApprovedTitle',
    en: 'Withdrawal approved',
    vi: 'Yêu cầu rút tiền đã được duyệt',
  },
  withdrawalApprovedBody: {
    key: 'withdrawalApprovedBody',
    en: 'Your withdrawal of {amount} {symbol} is being processed.',
    vi: 'Yêu cầu rút {amount} {symbol} của bạn đang được xử lý.',
    vars: ['amount', 'symbol'],
  },
  withdrawalRejectedTitle: {
    key: 'withdrawalRejectedTitle',
    en: 'Withdrawal rejected',
    vi: 'Yêu cầu rút tiền bị từ chối',
  },
  withdrawalRejectedBody: {
    key: 'withdrawalRejectedBody',
    en: 'Your withdrawal request was rejected. Reason: {reason}',
    vi: 'Yêu cầu rút tiền của bạn đã bị từ chối. Lý do: {reason}',
    vars: ['reason'],
  },
  withdrawalRejectedBodyNoReason: {
    key: 'withdrawalRejectedBodyNoReason',
    en: 'Your withdrawal request has been rejected.',
    vi: 'Yêu cầu rút tiền của bạn đã bị từ chối.',
  },
  withdrawalCompletedTitle: {
    key: 'withdrawalCompletedTitle',
    en: 'Withdrawal completed',
    vi: 'Rút tiền hoàn tất',
  },
  withdrawalCompletedBody: {
    key: 'withdrawalCompletedBody',
    en: 'Your withdrawal of {amount} {symbol} has been confirmed on the blockchain.',
    vi: 'Yêu cầu rút {amount} {symbol} của bạn đã được xác nhận trên blockchain.',
    vars: ['amount', 'symbol'],
  },
  withdrawalFailedTitle: {
    key: 'withdrawalFailedTitle',
    en: 'Withdrawal failed',
    vi: 'Rút tiền thất bại',
  },
  withdrawalFailedBody: {
    key: 'withdrawalFailedBody',
    en: 'Your withdrawal could not be completed. Please contact support.',
    vi: 'Yêu cầu rút tiền không thể hoàn tất. Vui lòng liên hệ hỗ trợ.',
  },
  depositCompletedTitle: {
    key: 'depositCompletedTitle',
    en: 'Deposit completed',
    vi: 'Nạp tiền đã hoàn tất',
  },
  depositCompletedBody: {
    key: 'depositCompletedBody',
    en: 'Your deposit of {amount} {symbol} has been credited.',
    vi: 'Giao dịch nạp {amount} {symbol} đã được ghi nhận.',
    vars: ['amount', 'symbol'],
  },
  depositSubmittedTitle: {
    key: 'depositSubmittedTitle',
    en: 'Deposit submitted',
    vi: 'Nạp tiền đã ghi nhận',
  },
  depositSubmittedBody: {
    key: 'depositSubmittedBody',
    en: 'Your deposit of {amount} {symbol} has been recorded and is awaiting confirmation.',
    vi: 'Giao dịch nạp {amount} {symbol} đã được ghi nhận và đang chờ xác nhận.',
    vars: ['amount', 'symbol'],
  },
};

/**
 * Default locale used when no Accept-Language header / query param /
 * user preference is available. Override via `I18N_DEFAULT_LOCALE` env.
 */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Supported locales. Anything not listed here falls back to `DEFAULT_LOCALE`.
 */
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'vi'] as const;

/** Catalog statistics for logging at boot. */
export function catalogStats(): {
  errors: number;
  validation: number;
  fieldValidation: number;
  success: number;
  mail: number;
  notifications: number;
} {
  return {
    errors: Object.keys(ERROR_MESSAGES).length,
    validation: Object.keys(VALIDATION_MESSAGES).length,
    fieldValidation: Object.keys(FIELD_VALIDATION_MESSAGES).length,
    success: Object.keys(SUCCESS_MESSAGES).length,
    mail: Object.keys(MAIL_MESSAGES).length,
    notifications: Object.keys(NOTIFICATION_MESSAGES).length,
  };
}