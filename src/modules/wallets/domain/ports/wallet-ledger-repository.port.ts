import type { EntityManager } from 'typeorm';
import type { WalletLedger } from '@/entities/wallet-ledger.entity';

export interface LedgerEntryInput {
  userId: string;
  currencyId: string;
  refType: string;
  refId: number | string;
  direction: 'CREDIT' | 'DEBIT';
  amount: string;
  balanceAfter: string;
}

/**
 * Port: Wallet Ledger Repository
 * Domain-level abstraction for wallet ledger persistence.
 */
export interface WalletLedgerRepositoryPort {
  createEntry(entry: LedgerEntryInput, manager?: EntityManager): Promise<WalletLedger>;

  createDoubleEntry(
    base: Omit<LedgerEntryInput, 'direction'>,
    manager?: EntityManager,
  ): Promise<[WalletLedger, WalletLedger]>;

  findRecentByUserAndCurrency(
    userId: string,
    currencyId: string,
    limit: number,
  ): Promise<
    Array<{ ref_type: string; ref_id: number; direction: string; amount: string; created_at: Date }>
  >;
}

export const WALLET_LEDGER_REPOSITORY = Symbol('WALLET_LEDGER_REPOSITORY');
