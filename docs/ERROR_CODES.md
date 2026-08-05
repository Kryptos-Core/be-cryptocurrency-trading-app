# Error Codes Registry (BE → FE contract)

This is the **canonical list of stable error codes** the NestJS backend emits via
`AppException`. Each code identifies an error category independent of any
human-language rendering.

The Flutter frontend (`fe-cryptocurrency-trading-app`) maps every code listed
here to a localized string under the `apiError<PascalCode>` namespace in
`lib/core/l10n/app_en.arb` and `app_vi.arb`. The single switch that performs
the mapping is `lib/core/utils/api_error_localizer.dart`.

Source of truth: [`src/common/errors/error-codes.enum.ts`](../src/common/errors/error-codes.enum.ts)
Messages: [`src/common/i18n/messages.ts`](../src/common/i18n/messages.ts)

## How to add a new code

1. **BE**: add the new value to `ErrorCode` in `error-codes.enum.ts`.
2. **BE**: add the matching entry to `ERROR_MESSAGES` in `messages.ts`
   (both `en` and `vi` are mandatory).
3. **BE**: (optional) add a typed descriptor helper in
   `src/common/errors/error-descriptors.ts` and use it at throw sites.
4. **BE**: add the new code to the table below (PR description).
5. **FE**: add `apiError<PascalCase>` keys to `app_en.arb` + `app_vi.arb`.
6. **FE**: add a `case` to the switch in `api_error_localizer.dart`.

The FE team should subscribe to BE PRs that touch this file so the ARB can
be extended in the same release.

## Sync workflow

1. Add a stable string value to the BE `ErrorCode` enum; the registry entry must document its HTTP status.
2. Add the user-facing message to `messages.ts` in both EN and VI, preserving any `{vars}` used for interpolation.
3. Add matching `apiError<PascalCase>` keys to both FE ARB files.
4. Add `case '<CODE>':` to the switch in `api_error_localizer.dart`.
5. Add the code to the registry table below so future developers can discover it.

Only user-facing API responses are translated. Server console and operation logs remain untranslated.

## Codes

| Code | HTTP | Domain | Notes |
|---|---|---|---|
| `BAD_REQUEST` | 400 | generic | default `BadRequestException` code |
| `UNAUTHORIZED` | 401 | generic | default `UnauthorizedException` code |
| `FORBIDDEN` | 403 | generic | default `ForbiddenException` code |
| `NOT_FOUND` | 404 | generic | default `NotFoundException` code |
| `CONFLICT` | 409 | generic | default `ConflictException` code |
| `VALIDATION_ERROR` | 422 | generic | DTO validation failures |
| `BUSINESS_ERROR` | 400 | generic | business rule violation |
| `INTERNAL_SERVER_ERROR` | 500 | generic | unhandled server-side error |
| `SERVICE_UNAVAILABLE` | 503 | generic | upstream/dependency down |
| `EMAIL_EXISTS` | 409 | auth | email already used by another user |
| `INVALID_OTP` | 400 | auth | OTP wrong or expired |
| `OTP_REQUIRED` | 400 | auth | OTP must be supplied |
| `OTP_COOLDOWN` | 400 | auth | resend OTP too soon |
| `OTP_ATTEMPT_LIMIT_EXCEEDED` | 400 | auth | brute-force lock |
| `TWO_FA_REQUIRED` | 400 | auth | 2FA must be enabled first |
| `ACCOUNT_BANNED` | 400 | auth | account banned |
| `EMAIL_VERIFICATION_DISABLED` | 400 | auth | admin turned off OTP |
| `NOT_WALLET_PLACEHOLDER` | 400 | users | only wallet-placeholder accounts can change email |
| `USE_CONTACT_EMAIL_VERIFICATION` | 400 | users | must use OTP flow |
| `USE_CHANGE_PASSWORD_ENDPOINT` | 400 | users | wrong endpoint |
| `INVALID_PAYLOAD` | 400 | users | missing required field |
| `INVALID_CHANGE_TYPE` | 400 | users | unsupported change type |
| `AVATAR_UPLOAD_DISABLED` | 400 | users | admin disabled uploads |
| `CONTACT_EMAIL_REQUIRED` | 400 | users | needs contact email set |
| `INVALID_AVATAR_FORMAT` | 400 | users | avatar mime not allowed |
| `AVATAR_REQUIRED` | 400 | users | avatar missing |
| `INVALID_USER` | 400 | users | unknown user |
| `WITHDRAWAL_PROCESSING` | 409 | withdrawals | already processing |
| `WITHDRAWAL_DUPLICATE` | 409 | withdrawals | duplicate submit |
| `WITHDRAWAL_NOT_FOUND` | 409 | withdrawals | not found |
| `WITHDRAWAL_PENDING_EXISTS` | 409 | withdrawals | pending exists |
| `PENDING_WITHDRAWALS` | 400 | withdrawals | pending exist |
| `USER_NOT_FOUND` | 400 | withdrawals | user missing |
| `WALLET_NOT_FOUND` | 409 | withdrawals | wallet missing |
| `INVALID_AMOUNT` | 400 | common | amount bad |
| `INVALID_TARGET` | 400 | wallets | transfer target same user |
| `TARGET_REQUIRED` | 400 | wallets | targetUserId missing |
| `INVALID_ACTION` | 400 | wallets | unknown wallet action |
| `INSUFFICIENT_BALANCE` | 400 | wallets | not enough funds |
| `ACCOUNT_FROZEN` | 400 | wallets | account frozen |
| `CHAIN_REQUIRED` | 400 | blockchain | chain query missing |
| `TX_HASH_REQUIRED` | 400 | blockchain | txHash missing |
| `ADMIN_INGEST_MISSING_PARAMS` | 400 | blockchain | admin ingest missing |
| `INVALID_ADDRESS` | 400 | auth | bad address on chain |
| `INVALID_TRON_ADDRESS` | 400 | wallets | bad Tron address |
| `INVALID_EVM_ADDRESS` | 400 | wallets | bad EVM address |
| `INVALID_SIGNATURE` | 400 | blockchain | signature verify fail |
| `WALLET_ALREADY_LINKED` | 409 | blockchain | already linked |
| `WALLET_INACTIVE` | 400 | wallets | inactive |
| `LINK_NOT_FOUND` | 400 | blockchain | link not found |
| `WC_AUTH_SESSION_EXPIRED` | 400 | auth | WalletConnect expired |
| `WC_AUTH_INVALID_PAYLOAD` | 400 | auth | WC payload bad |
| `TREASURY_WALLET_BUSY` | 400 | treasury | concurrent operation |
| `TREASURY_WALLET_BUSY_TIMEOUT` | 400 | treasury | waited too long |
| `TREASURY_WALLET_INACTIVE` | 400 | treasury | tx wallet inactive |
| `TREASURY_WALLET_LOCKED` | 400 | treasury | wallet locked |
| `TREASURY_CHAIN_UNSUPPORTED` | 400 | treasury | chain not supported |
| `TREASURY_CHAIN_NOT_EVM` | 400 | treasury | EVM required |
| `TREASURY_INVALID_AMOUNT` | 400 | treasury | amount bad |
| `TREASURY_SWEEP_USDT_ZERO` | 400 | treasury | nothing to sweep |
| `TREASURY_USDT_CHAIN` | 400 | treasury | USDT sweep needs Tron |
| `TREASURY_CONFIRM_NO_WALLET` | 400 | treasury | confirm needs wallet |
| `TREASURY_MANUAL_SETTLE_TX_EMPTY` | 400 | treasury | txHash required |
| `TREASURY_OPERATION_NOT_FOUND` | 404 | treasury | op not found |
| `TREASURY_OPERATION_STATE_INVALID` | 400 | treasury | wrong state |
| `TREASURY_OPERATION_NOT_QUEUED` | 400 | treasury | not queued |
| `TREASURY_OPERATION_NOT_PROCESSING` | 400 | treasury | not processing |
| `TREASURY_OPERATION_NOT_CONFIRMING` | 400 | treasury | not confirming |
| `TREASURY_OPERATION_NOT_COMPLETED` | 400 | treasury | not completed |
| `TREASURY_OPERATION_NOT_FAILED` | 400 | treasury | not failed |
| `TREASURY_TX_HASH_NOT_FOUND` | 404 | treasury | tx hash missing |
| `TREASURY_INSUFFICIENT_FUNDS` | 400 | treasury | not enough balance |
| `TREASURY_BALANCE_RECONCILE_FAILED` | 500 | treasury | reconcile fail |
| `TREASURY_OPERATION_TYPE_UNSUPPORTED` | 400 | treasury | unknown op type |
| `TREASURY_RPC_UNAVAILABLE` | 503 | treasury | RPC down |
| `TREASURY_RPC_TIMEOUT` | 503 | treasury | RPC timeout |
| `TREASURY_GAS_ESTIMATE_FAILED` | 503 | treasury | gas fail |
| `TREASURY_NONCE_CONFLICT` | 409 | treasury | nonce conflict |
| `TREASURY_TX_REVERTED` | 400 | treasury | tx reverted |
| `TREASURY_TX_BROADCAST_FAILED` | 503 | treasury | broadcast fail |
| `TX_WALLET_EXISTS` | 409 | treasury | tx wallet dup |
| `TX_WALLET_NOT_FOUND` | 404 | treasury | tx wallet missing |
| `TX_WALLET_NON_ZERO_BALANCE` | 400 | treasury | balance too high |
| `TX_WALLET_USDT_NON_ZERO` | 400 | treasury | USDT not drained |
| `TX_WALLET_DEFAULT_DEPOSIT_DELETE_FORBIDDEN` | 400 | treasury | default deposit set |
| `TX_WALLET_OPERATION_IN_FLIGHT` | 400 | treasury | op in flight |
| `DEFAULT_USER_DEPOSIT_DEACTIVATE_FORBIDDEN` | 400 | treasury | default deposit |
| `TRON_USDT_DESTINATION_NOT_ACTIVATED` | 400 | treasury | destination needs TRX |
| `TRON_ACCOUNT_PREFLIGHT_UNAVAILABLE` | 503 | treasury | preflight unavailable |
| `TREASURY_MAIN_WALLET_NOT_FOUND` | 404 | treasury | main wallet missing |
| `TREASURY_MAIN_WALLET_CONFLICT` | 409 | treasury | main wallet dup |
| `ORDER_NOT_FOUND` | 404 | orders | order missing |
| `ORDER_NOT_OPEN` | 400 | orders | not open |
| `INVALID_PRICE` | 400 | orders | price bad |
| `INVALID_INPUT` | 400 | orders | input bad |
| `INVALID_MARKET_BUY_RESERVE` | 400 | orders | reserve bad |
| `NO_LIQUIDITY` | 400 | orders | no liquidity |
| `ORDER_CREATE_FAILED` | 400 | orders | create fail |
| `INVALID_STATE` | 400 | orders | bad state |
| `OVERFILL_ATTEMPT` | 400 | orders | would overfill |
| `CANCEL_FAILED` | 400 | orders | cancel fail |
| `PAIR_NOT_FOUND` | 404 | orders | pair missing |
| `INVALID_ORDER_TYPE` | 400 | orders | unknown type |
| `ORDER_BOOK_SERVICE_UNAVAILABLE` | 503 | orders | ob service down |
| `INVALID_DEPTH_LIMIT` | 400 | markets | depth bad |
| `INVALID_INTERVAL` | 400 | markets | interval bad |
| `MARKET_PAIR_SYMBOL_EXISTS` | 409 | markets | pair dup |
| `BASE_QUOTE_SAME` | 400 | markets | base=quote |
| `BASE_QUOTE_REQUIRED` | 400 | markets | missing |
| `CURRENCY_NOT_FOUND` | 404 | currencies | missing |
| `CURRENCY_SYMBOL_EXISTS` | 409 | currencies | dup |
| `CURRENCY_DISABLED` | 400 | currencies | disabled |
| `MARKET_MAKER_CONFIG_NOT_FOUND` | 404 | market maker | missing |
| `MARKET_MAKER_CONFIG_CONFLICT` | 409 | market maker | conflict |
| `MARKET_MAKER_INVALID_SPREAD` | 400 | market maker | spread bad |
| `MARKET_MAKER_INVALID_AMOUNT` | 400 | market maker | amount bad |
| `MARKET_MAKER_NO_ACTIVE_PAIRS` | 400 | market maker | no pairs |
| `MARKET_MAKER_PLACE_FAILED` | 400 | market maker | place fail |
| `CONFIG_KEY_NOT_FOUND` | 404 | system config | key missing |
| `CONFIG_KEY_DISALLOWED` | 400 | system config | not allowed |
| `CONFIG_KEY_READ_ONLY` | 400 | system config | read only |
| `CONFIG_VALUE_INVALID` | 400 | system config | value bad |
| `ADMIN_REQUIRED` | 403 | authz | admin only |
| `RISK_OFFICER_REQUIRED` | 403 | authz | risk officer only |
| `FINANCE_MANAGER_REQUIRED` | 403 | authz | finance only |
| `DEPOSIT_NOT_FOUND` | 404 | deposits | missing |
| `DEPOSIT_ALREADY_PAID` | 409 | deposits | already paid |
| `DEPOSIT_AMOUNT_INVALID` | 400 | deposits | amount bad |
| `DEPOSIT_CHAIN_UNSUPPORTED` | 400 | deposits | chain unsupported |
| `DEPOSIT_POLL_FAILED` | 503 | deposits | poll fail |
| `TX_FAILED` | 400 | blockchain | tx fail |
| `ENCRYPTION_FAILED` | 500 | infra | encrypt fail |
| `DECRYPTION_FAILED` | 500 | infra | decrypt fail |
| `ENCRYPTED_PAYLOAD_MALFORMED` | 500 | infra | payload bad |
| `DECRYPTED_PAYLOAD_INVALID` | 500 | infra | payload bad |
| `EXTERNAL_PROVIDER_UNAVAILABLE` | 503 | infra | external down |
| `EXTERNAL_PROVIDER_RATE_LIMITED` | 503 | infra | rate limited |
| `NOTIFICATION_DELIVERY_FAILED` | 503 | notifications | push fail |
| `FCM_NOT_CONFIGURED` | 503 | notifications | FCM not set |
| `TRON_SEND_FAILED` | 400 | wallets | tron send fail |