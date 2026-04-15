import type { TransactionContext } from '@/common/types/transaction-context';
import type { Wallet } from '@/entities/wallet.entity';

/**
 * Port: Wallet Repository
 * Domain-level abstraction for wallet persistence.
 * Infrastructure layer provides the concrete implementation.
 */
export interface WalletRepositoryPort {
  findByUser(
    userId: string,
    includeZero: boolean,
  ): Promise<Array<Wallet & { currency_symbol: string; currency_name: string }>>;

  findByUserCurrency(
    userId: string,
    currencyId: string,
    ctx?: TransactionContext,
  ): Promise<Wallet | null>;

  getOrCreateForUpdate(
    userId: string,
    currencyId: string,
    ctx: TransactionContext,
  ): Promise<Wallet>;

  applyBalanceDelta(
    walletId: string,
    deltaAvailable: string,
    deltaFrozen: string,
    ctx: TransactionContext,
  ): Promise<Wallet>;

  findWalletPairs(limit: number): Promise<Array<{ userId: string; currencyId: string }>>;

  transaction<R>(fn: (ctx: TransactionContext) => Promise<R>): Promise<R>;
}

export const WALLET_REPOSITORY = Symbol('WALLET_REPOSITORY');
