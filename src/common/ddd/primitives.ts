/**
 * Domain primitives — branded types for compile-time ID correctness.
 *
 * TypeScript's structural type system allows mixing `string` IDs of different
 * domains (e.g. passing an `orderId` where a `walletId` is expected).
 * Branded types add a phantom "brand" property that makes nominal distinctions
 * visible to the type checker while remaining plain `string` at runtime.
 *
 * Usage:
 * ```typescript
 * // Entity uses branded ID
 * export class Order extends Entity<OrderId> { ... }
 *
 * // Call sites are type-safe — swapping IDs is a compile error
 * const wallet = await walletRepo.findById(walletId); // ✅
 * const wallet = await walletRepo.findById(orderId); // ❌ compile error
 *
 * // Runtime: plain string value
 * console.log(walletId); // "018e9a..."
 * ```
 *
 * ID creation:
 * ```typescript
 * const id = OrderId.wrap('018e9a7b-...'); // OrderId
 * const raw = OrderId.unwrap(id); // string
 * ```
 */

// ── Brand helpers ─────────────────────────────────────────────────────────────

/**
 * Nominal brand — intersect a value type with a phantom brand tag.
 *
 * @example
 * type OrderId = Brand<string, 'OrderId'>;
 * const id: OrderId = 'abc' as OrderId; // explicit cast at domain boundary
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/**
 * Branded ID = string with a nominal brand.
 */
export type BrandedId<B extends string> = Brand<string, B>;

// ── Branded ID factory ───────────────────────────────────────────────────────

/**
 * Factory for domain ID values. Provides type-safe wrap/unwrap helpers.
 *
 * Usage:
 * ```typescript
 * export const OrderId = createBrandedIdFactory('OrderId');
 * export type OrderId = OrderId['T'];
 *
 * const id = OrderId.wrap('018e9a...'); // OrderId
 * const raw = OrderId.unwrap(id); // string
 * ```
 */
export function createBrandedIdFactory<B extends string>(brand: B) {
  type T = BrandedId<B>;
  return {
    brand,
    T: undefined as unknown as T,

    wrap(value: string): T {
      return value as T;
    },

    unwrap(id: T): string {
      return id as unknown as string;
    },

    isValid(value: unknown): value is T {
      return typeof value === 'string' && value.length > 0;
    },
  } as const;
}

// ── Common domain IDs ────────────────────────────────────────────────────────

/** Unique identifier for an Order entity. */
export const OrderId = createBrandedIdFactory('OrderId');
export type OrderId = (typeof OrderId)['T'];

/** Unique identifier for a Trade entity. */
export const TradeId = createBrandedIdFactory('TradeId');
export type TradeId = (typeof TradeId)['T'];

/** Unique identifier for a Wallet entity. */
export const WalletId = createBrandedIdFactory('WalletId');
export type WalletId = (typeof WalletId)['T'];

/** Unique identifier for a Currency entity. */
export const CurrencyId = createBrandedIdFactory('CurrencyId');
export type CurrencyId = (typeof CurrencyId)['T'];

/** Unique identifier for a Market/Pair entity. */
export const MarketPairId = createBrandedIdFactory('MarketPairId');
export type MarketPairId = (typeof MarketPairId)['T'];

/** Unique identifier for a User entity. */
export const UserId = createBrandedIdFactory('UserId');
export type UserId = (typeof UserId)['T'];

/** Unique identifier for a Deposit entity. */
export const DepositId = createBrandedIdFactory('DepositId');
export type DepositId = (typeof DepositId)['T'];

/** Unique identifier for a Withdrawal entity. */
export const WithdrawalId = createBrandedIdFactory('WithdrawalId');
export type WithdrawalId = (typeof WithdrawalId)['T'];

/** Unique identifier for a notification entity. */
export const NotificationId = createBrandedIdFactory('NotificationId');
export type NotificationId = (typeof NotificationId)['T'];

/** Unique identifier for a blockchain transaction. */
export const TransactionHash = createBrandedIdFactory('TransactionHash');
export type TransactionHash = (typeof TransactionHash)['T'];

/** Unique identifier for a blockchain wallet address. */
export const BlockchainAddrId = createBrandedIdFactory('BlockchainAddrId');
export type BlockchainAddrId = (typeof BlockchainAddrId)['T'];
