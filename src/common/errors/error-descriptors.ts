/**
 * Typed error descriptor factories.
 *
 * Each helper constructs an `AppException` (or subclass) with the canonical
 * `ErrorCode`. The `message` is intentionally an empty string — the global
 * `AllExceptionsFilter` renders the localized text from
 * `src/common/i18n/messages.ts` based on `code` + the request locale, so
 * whatever the throw site passes is never shown to the client.
 *
 * Migration status (incremental rollout):
 *   - The BE currently has ~365 throw sites that call the legacy constructors
 *     directly: `throw new ConflictException('msg', 'CODE')` etc.
 *   - This file is the new canonical surface. It is **the** dispatch table
 *     the filter reads for code → context → rendered text, but it does not
 *     yet have consumers at the throw sites.
 *   - The remaining migration (rewriting each `throw new XException(...)` to
 *     `throw XxxException(...)` and stripping the hardcoded prose) is tracked
 *     separately. Until that lands, throw sites may keep their hardcoded
 *     Vietnamese messages — the filter will still prefer the BE `code` if
 *     present and fall back to the throw-site message when no descriptor is
 *     involved.
 *
 * Usage at throw sites (future):
 *
 *   throw EmailExistsException({ email: newEmail });
 *   throw InvalidAmountException();
 *   throw WithdrawalPendingExistsException({ count: pending.length });
 *
 * Adding a new descriptor:
 *   1. Add the code to `ErrorCode` in `error-codes.enum.ts`.
 *   2. Add the matching `ERROR_MESSAGES` entry in `messages.ts`.
 *   3. Add a factory below that returns the right exception subclass.
 *   4. Document the code in `docs/ERROR_CODES.md`.
 *
 * Why `message = ''` and not `undefined`:
 *   The exception classes in `app.exception.ts` declare `message: string`
 *   (non-nullable). The global filter is the only place that re-renders the
 *   user-facing string, so the constructor value is throwaway. Passing `''`
 *   keeps the type contract honest without forcing the filter to special-case
 *   `undefined`.
 *
 * Context forwarding:
 *   `BadRequestException`, `BusinessException`, `ConflictException` and
 *   `ServiceUnavailableException` accept an optional `context` argument and
 *   forward it to `AppException` so the filter can pass it to
 *   `translateError(code, locale, context)` for interpolation variables
 *   (e.g. `{seconds}` in `OTP_COOLDOWN`, `{count}` in `WITHDRAWAL_PENDING_EXISTS`).
 *   `NotFoundException`, `UnauthorizedException` and `InternalServerException`
 *   keep their legacy shapes and do not accept context; any interpolation those
 *   codes need is baked into the static template in `messages.ts`.
 */
import {
  BadRequestException,
  BusinessException,
  ConflictException,
  ForbiddenException,
  InternalServerException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationException,
} from '../exceptions';
import { ErrorCode } from './error-codes.enum';

// ─── Generic ────────────────────────────────────────────────────────────

export const BadRequest = (context?: Record<string, unknown>) =>
  new BadRequestException('', ErrorCode.BAD_REQUEST, context);

export const Unauthorized = (_context?: Record<string, unknown>) =>
  new UnauthorizedException('');

export const Forbidden = (_context?: Record<string, unknown>) => new ForbiddenException('');

export const NotFound = (
  code: ErrorCode = ErrorCode.NOT_FOUND,
  _context?: Record<string, unknown>,
) => new NotFoundException('', code);

export const Conflict = (
  code: ErrorCode = ErrorCode.CONFLICT,
  _context?: Record<string, unknown>,
) => new ConflictException('', code);

export const ValidationError = (message: string, context?: Record<string, unknown>) =>
  new ValidationException(message, ErrorCode.VALIDATION_ERROR, context);

export const Business = (
  code: ErrorCode = ErrorCode.BUSINESS_ERROR,
  context?: Record<string, unknown>,
) => new BusinessException('', code, context);

export const InternalError = (
  code: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
  _context?: Record<string, unknown>,
) => new InternalServerException('', code);

export const ServiceUnavailable = (
  code: ErrorCode = ErrorCode.SERVICE_UNAVAILABLE,
  context?: Record<string, unknown>,
) => new ServiceUnavailableException('', code, context);

// ─── Auth & users ───────────────────────────────────────────────────────

export const EmailExistsException = (_ctx: { email?: string } = {}) =>
  new ConflictException('', ErrorCode.EMAIL_EXISTS);

export const InvalidOtpException = () => new BadRequestException('', ErrorCode.INVALID_OTP);

export const OtpRequiredException = () => new BadRequestException('', ErrorCode.OTP_REQUIRED);

export const OtpCooldownException = (ctx: { seconds: number }) =>
  new BadRequestException('', ErrorCode.OTP_COOLDOWN, ctx);

export const OtpAttemptLimitException = (ctx: { seconds: number }) =>
  new BadRequestException('', ErrorCode.OTP_ATTEMPT_LIMIT_EXCEEDED, ctx);

export const TwoFaRequiredException = () => new BadRequestException('', ErrorCode.TWO_FA_REQUIRED);

export const AccountBannedException = () => new BusinessException('', ErrorCode.ACCOUNT_BANNED);

export const EmailVerificationDisabledException = () =>
  new BadRequestException('', ErrorCode.EMAIL_VERIFICATION_DISABLED);

export const NotWalletPlaceholderException = () =>
  new BadRequestException('', ErrorCode.NOT_WALLET_PLACEHOLDER);

export const UseContactEmailVerificationException = () =>
  new BadRequestException('', ErrorCode.USE_CONTACT_EMAIL_VERIFICATION);

export const UseChangePasswordEndpointException = () =>
  new BadRequestException('', ErrorCode.USE_CHANGE_PASSWORD_ENDPOINT);

export const InvalidPayloadException = () =>
  new BadRequestException('', ErrorCode.INVALID_PAYLOAD);

export const InvalidChangeTypeException = () =>
  new BadRequestException('', ErrorCode.INVALID_CHANGE_TYPE);

export const AvatarUploadDisabledException = () =>
  new BadRequestException('', ErrorCode.AVATAR_UPLOAD_DISABLED);

export const ContactEmailRequiredException = () =>
  new BadRequestException('', ErrorCode.CONTACT_EMAIL_REQUIRED);

export const InvalidAvatarFormatException = () =>
  new BadRequestException('', ErrorCode.INVALID_AVATAR_FORMAT);

export const AvatarRequiredException = () =>
  new BadRequestException('', ErrorCode.AVATAR_REQUIRED);

// ─── Withdrawals / onchain (user) ──────────────────────────────────────

export const WithdrawalProcessingException = () =>
  new ConflictException('', ErrorCode.WITHDRAWAL_PROCESSING);

export const WithdrawalDuplicateException = () =>
  new ConflictException('', ErrorCode.WITHDRAWAL_DUPLICATE);

export const WithdrawalNotFoundException = () =>
  new ConflictException('', ErrorCode.WITHDRAWAL_NOT_FOUND);

export const WithdrawalPendingExistsException = (ctx: { count: number }) =>
  new ConflictException('', ErrorCode.WITHDRAWAL_PENDING_EXISTS, ctx);

export const PendingWithdrawalsException = () =>
  new BadRequestException('', ErrorCode.PENDING_WITHDRAWALS);

export const UserNotFoundException = () => new BusinessException('', ErrorCode.USER_NOT_FOUND);

export const WalletNotFoundException = () =>
  new ConflictException('', ErrorCode.WALLET_NOT_FOUND);

export const InvalidAmountException = () =>
  new BadRequestException('', ErrorCode.INVALID_AMOUNT);

export const InvalidTargetException = () =>
  new BadRequestException('', ErrorCode.INVALID_TARGET);

export const TargetRequiredException = () =>
  new BadRequestException('', ErrorCode.TARGET_REQUIRED);

export const InvalidActionException = () =>
  new BadRequestException('', ErrorCode.INVALID_ACTION);

export const InsufficientBalanceException = () =>
  new BusinessException('', ErrorCode.INSUFFICIENT_BALANCE);

export const AccountFrozenException = () => new BusinessException('', ErrorCode.ACCOUNT_FROZEN);

export const ChainRequiredException = () => new BadRequestException('', ErrorCode.CHAIN_REQUIRED);

export const TxHashRequiredException = () =>
  new BadRequestException('', ErrorCode.TX_HASH_REQUIRED);

export const AdminIngestMissingParamsException = () =>
  new BadRequestException('', ErrorCode.ADMIN_INGEST_MISSING_PARAMS);

export const InvalidAddressException = (_ctx: { chain: string }) =>
  new BadRequestException('', ErrorCode.INVALID_ADDRESS);

export const InvalidTronAddressException = () =>
  new BadRequestException('', ErrorCode.INVALID_TRON_ADDRESS);

export const InvalidEvmAddressException = () =>
  new BadRequestException('', ErrorCode.INVALID_EVM_ADDRESS);

export const InvalidSignatureException = () =>
  new BadRequestException('', ErrorCode.INVALID_SIGNATURE);

export const WalletAlreadyLinkedException = () =>
  new ConflictException('', ErrorCode.WALLET_ALREADY_LINKED);

export const WalletInactiveException = () =>
  new BadRequestException('', ErrorCode.WALLET_INACTIVE);

export const LinkNotFoundException = () => new BadRequestException('', ErrorCode.LINK_NOT_FOUND);

// ─── Treasury / transaction wallets ────────────────────────────────────

export const TreasuryWalletBusyException = (ctx?: Record<string, unknown>) =>
  new BusinessException('', ErrorCode.TREASURY_WALLET_BUSY, ctx);

export const TreasuryWalletBusyTimeoutException = () =>
  new BusinessException('', ErrorCode.TREASURY_WALLET_BUSY_TIMEOUT);

export const TreasuryWalletInactiveException = () =>
  new BadRequestException('', ErrorCode.TREASURY_WALLET_INACTIVE);

export const TreasuryWalletLockedException = () =>
  new BadRequestException('', ErrorCode.TREASURY_WALLET_LOCKED);

export const TreasuryChainUnsupportedException = () =>
  new BadRequestException('', ErrorCode.TREASURY_CHAIN_UNSUPPORTED);

export const TreasuryChainNotEvmException = () =>
  new BadRequestException('', ErrorCode.TREASURY_CHAIN_NOT_EVM);

export const TreasuryInvalidAmountException = () =>
  new BadRequestException('', ErrorCode.TREASURY_INVALID_AMOUNT);

export const TreasurySweepUsdtZeroException = () =>
  new BusinessException('', ErrorCode.TREASURY_SWEEP_USDT_ZERO);

export const TreasuryUsdtChainException = () =>
  new BusinessException('', ErrorCode.TREASURY_USDT_CHAIN);

export const TreasuryConfirmNoWalletException = () =>
  new BusinessException('', ErrorCode.TREASURY_CONFIRM_NO_WALLET);

export const TreasuryManualSettleTxEmptyException = () =>
  new BadRequestException('', ErrorCode.TREASURY_MANUAL_SETTLE_TX_EMPTY);

export const TreasuryTxHashNotFoundException = () =>
  new BusinessException('', ErrorCode.TREASURY_TX_HASH_NOT_FOUND);

export const TreasuryInsufficientFundsException = () =>
  new BusinessException('', ErrorCode.TREASURY_INSUFFICIENT_FUNDS);

export const TreasuryRpcUnavailableException = () =>
  new ServiceUnavailableException('', ErrorCode.TREASURY_RPC_UNAVAILABLE);

export const TreasuryRpcTimeoutException = () =>
  new ServiceUnavailableException('', ErrorCode.TREASURY_RPC_TIMEOUT);

export const TreasuryNonceConflictException = () =>
  new BusinessException('', ErrorCode.TREASURY_NONCE_CONFLICT);

export const TreasuryTxRevertedException = () =>
  new BusinessException('', ErrorCode.TREASURY_TX_REVERTED);

export const TreasuryTxBroadcastFailedException = () =>
  new ServiceUnavailableException('', ErrorCode.TREASURY_TX_BROADCAST_FAILED);

export const TxWalletExistsException = () =>
  new ConflictException('', ErrorCode.TX_WALLET_EXISTS);

export const TxWalletNotFoundException = () =>
  new NotFoundException('', ErrorCode.TX_WALLET_NOT_FOUND);

export const TxWalletNonZeroBalanceException = (_ctx: { maxAmount: string; symbol: string }) =>
  new BadRequestException('', ErrorCode.TX_WALLET_NON_ZERO_BALANCE);

export const TxWalletUsdtNonZeroException = () =>
  new BadRequestException('', ErrorCode.TX_WALLET_USDT_NON_ZERO);

export const TxWalletDefaultDepositDeleteForbiddenException = () =>
  new BadRequestException('', ErrorCode.TX_WALLET_DEFAULT_DEPOSIT_DELETE_FORBIDDEN);

export const TxWalletOperationInFlightException = () =>
  new BadRequestException('', ErrorCode.TX_WALLET_OPERATION_IN_FLIGHT);

export const DefaultUserDepositDeactivateForbiddenException = () =>
  new BadRequestException('', ErrorCode.DEFAULT_USER_DEPOSIT_DEACTIVATE_FORBIDDEN);

export const TronUsdtDestinationNotActivatedException = () =>
  new BadRequestException('', ErrorCode.TRON_USDT_DESTINATION_NOT_ACTIVATED);

export const TronAccountPreflightUnavailableException = () =>
  new ServiceUnavailableException('', ErrorCode.TRON_ACCOUNT_PREFLIGHT_UNAVAILABLE);

export const TreasuryMainWalletNotFoundException = () =>
  new NotFoundException('', ErrorCode.TREASURY_MAIN_WALLET_NOT_FOUND);

export const TreasuryMainWalletConflictException = () =>
  new ConflictException('', ErrorCode.TREASURY_MAIN_WALLET_CONFLICT);

// ─── Orders / matching ────────────────────────────────────────────────

export const OrderNotFoundException = () => new NotFoundException('', ErrorCode.ORDER_NOT_FOUND);

export const OrderNotOpenException = () => new BusinessException('', ErrorCode.ORDER_NOT_OPEN);

export const InvalidPriceException = () =>
  new BusinessException('', ErrorCode.INVALID_PRICE);

export const InvalidInputException = () => new BusinessException('', ErrorCode.INVALID_INPUT);

export const InvalidMarketBuyReserveException = () =>
  new BusinessException('', ErrorCode.INVALID_MARKET_BUY_RESERVE);

export const NoLiquidityException = () => new BusinessException('', ErrorCode.NO_LIQUIDITY);

export const OrderCreateFailedException = () =>
  new BusinessException('', ErrorCode.ORDER_CREATE_FAILED);

export const InvalidStateException = () => new BusinessException('', ErrorCode.INVALID_STATE);

export const OverfillAttemptException = () =>
  new BusinessException('', ErrorCode.OVERFILL_ATTEMPT);

export const CancelFailedException = () => new BusinessException('', ErrorCode.CANCEL_FAILED);

export const PairNotFoundException = () => new NotFoundException('', ErrorCode.PAIR_NOT_FOUND);

export const InvalidOrderTypeException = () =>
  new BusinessException('', ErrorCode.INVALID_ORDER_TYPE);

export const OrderBookServiceUnavailableException = () =>
  new ServiceUnavailableException('', ErrorCode.ORDER_BOOK_SERVICE_UNAVAILABLE);

export const InvalidDepthLimitException = () =>
  new BadRequestException('', ErrorCode.INVALID_DEPTH_LIMIT);

export const InvalidIntervalException = () =>
  new BadRequestException('', ErrorCode.INVALID_INTERVAL);

export const MarketPairSymbolExistsException = () =>
  new ConflictException('', ErrorCode.MARKET_PAIR_SYMBOL_EXISTS);

export const BaseQuoteSameException = () => new BadRequestException('', ErrorCode.BASE_QUOTE_SAME);

export const BaseQuoteRequiredException = () =>
  new BadRequestException('', ErrorCode.BASE_QUOTE_REQUIRED);

// ─── Markets / currencies ──────────────────────────────────────────────

export const CurrencyNotFoundException = () =>
  new NotFoundException('', ErrorCode.CURRENCY_NOT_FOUND);

export const CurrencySymbolExistsException = () =>
  new ConflictException('', ErrorCode.CURRENCY_SYMBOL_EXISTS);

export const CurrencyDisabledException = () =>
  new BadRequestException('', ErrorCode.CURRENCY_DISABLED);

// ─── Market maker ──────────────────────────────────────────────────────

export const MarketMakerConfigNotFoundException = () =>
  new NotFoundException('', ErrorCode.MARKET_MAKER_CONFIG_NOT_FOUND);

export const MarketMakerConfigConflictException = () =>
  new ConflictException('', ErrorCode.MARKET_MAKER_CONFIG_CONFLICT);

export const MarketMakerInvalidSpreadException = () =>
  new BadRequestException('', ErrorCode.MARKET_MAKER_INVALID_SPREAD);

export const MarketMakerInvalidAmountException = () =>
  new BadRequestException('', ErrorCode.MARKET_MAKER_INVALID_AMOUNT);

export const MarketMakerNoActivePairsException = () =>
  new BadRequestException('', ErrorCode.MARKET_MAKER_NO_ACTIVE_PAIRS);

export const MarketMakerPlaceFailedException = () =>
  new BadRequestException('', ErrorCode.MARKET_MAKER_PLACE_FAILED);

// ─── System config / admin authz ──────────────────────────────────────

export const ConfigKeyNotFoundException = () =>
  new NotFoundException('', ErrorCode.CONFIG_KEY_NOT_FOUND);

export const ConfigKeyDisallowedException = () =>
  new BadRequestException('', ErrorCode.CONFIG_KEY_DISALLOWED);

export const ConfigKeyReadOnlyException = () =>
  new BadRequestException('', ErrorCode.CONFIG_KEY_READ_ONLY);

export const ConfigValueInvalidException = () =>
  new BadRequestException('', ErrorCode.CONFIG_VALUE_INVALID);

export const AdminRequiredException = () =>
  new ForbiddenException('', ErrorCode.ADMIN_REQUIRED);

export const RiskOfficerRequiredException = () =>
  new ForbiddenException('', ErrorCode.RISK_OFFICER_REQUIRED);

export const FinanceManagerRequiredException = () =>
  new ForbiddenException('', ErrorCode.FINANCE_MANAGER_REQUIRED);

// ─── Deposits ──────────────────────────────────────────────────────────

export const DepositNotFoundException = () =>
  new NotFoundException('', ErrorCode.DEPOSIT_NOT_FOUND);

export const DepositAlreadyPaidException = () =>
  new ConflictException('', ErrorCode.DEPOSIT_ALREADY_PAID);

export const DepositAmountInvalidException = () =>
  new BadRequestException('', ErrorCode.DEPOSIT_AMOUNT_INVALID);

export const DepositChainUnsupportedException = () =>
  new BadRequestException('', ErrorCode.DEPOSIT_CHAIN_UNSUPPORTED);

export const DepositPollFailedException = () =>
  new ServiceUnavailableException('', ErrorCode.DEPOSIT_POLL_FAILED);

export const TxFailedException = () => new BusinessException('', ErrorCode.TX_FAILED);

// ─── Encryption / infra ────────────────────────────────────────────────

export const EncryptionFailedException = () =>
  new InternalServerException('', ErrorCode.ENCRYPTION_FAILED);

export const DecryptionFailedException = () =>
  new InternalServerException('', ErrorCode.DECRYPTION_FAILED);

export const EncryptedPayloadMalformedException = () =>
  new InternalServerException('', ErrorCode.ENCRYPTED_PAYLOAD_MALFORMED);

export const DecryptedPayloadInvalidException = () =>
  new InternalServerException('', ErrorCode.DECRYPTED_PAYLOAD_INVALID);

export const ExternalProviderUnavailableException = () =>
  new ServiceUnavailableException('', ErrorCode.EXTERNAL_PROVIDER_UNAVAILABLE);

export const ExternalProviderRateLimitedException = () =>
  new ServiceUnavailableException('', ErrorCode.EXTERNAL_PROVIDER_RATE_LIMITED);

// ─── Notifications / push ──────────────────────────────────────────────

export const NotificationDeliveryFailedException = () =>
  new ServiceUnavailableException('', ErrorCode.NOTIFICATION_DELIVERY_FAILED);

export const FcmNotConfiguredException = () =>
  new ServiceUnavailableException('', ErrorCode.FCM_NOT_CONFIGURED);

// ─── Tron send ─────────────────────────────────────────────────────────

export const TronSendFailedException = () =>
  new BusinessException('', ErrorCode.TRON_SEND_FAILED);
