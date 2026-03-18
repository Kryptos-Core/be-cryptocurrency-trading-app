import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { WalletLedger } from '@/entities/wallet-ledger.entity';

export interface LedgerEntryInput {
  userId: string;
  currencyId: string;
  refType:
    | 'DEPOSIT'
    | 'WITHDRAW'
    | 'ORDER'
    | 'TRADE'
    | 'ADJUST'
    | 'TRANSFER'
    | 'EXTERNAL_DEPOSIT'
    | 'EXTERNAL_WITHDRAWAL'
    | 'EXTERNAL_SYNC'
    | 'RECONCILIATION';
  /** Reference ID: integer for legacy rows, UUID string for new rows (e.g. adjustmentId). */
  refId: number | string;
  direction: 'CREDIT' | 'DEBIT';
  amount: string;
  balanceAfter: string;
}

/**
 * Wallet Ledger Repository
 * Repository Pattern: Encapsulates ledger persistence logic
 */
@Injectable()
export class WalletLedgerRepository extends BaseRepository<WalletLedger> {
  constructor(dataSource: DataSource) {
    super(WalletLedger, dataSource);
  }

  /**
   * Create a ledger entry within optional transaction scope
   */
  async createEntry(
    entry: LedgerEntryInput,
    manager?: EntityManager,
  ): Promise<WalletLedger> {
    const runner = manager ?? this.dataSource;
    const result = await runner.query(
      'CALL sp_wallet_ledger_create(?, ?, ?, ?, ?, ?, ?)',
      [
        entry.userId,
        entry.currencyId,
        entry.refType,
        String(entry.refId),
        entry.direction,
        entry.amount,
        entry.balanceAfter,
      ],
    );

    const created = result?.[0]?.[0] as WalletLedger | undefined;
    if (!created) {
      throw new Error('Failed to create wallet ledger entry');
    }

    return created;
  }

  /**
   * Find recent ledger entries by user and currency (for transaction history).
   * Uses raw SQL to avoid TypeORM entity metadata issues in some runtimes.
   */
  async findRecentByUserAndCurrency(
    userId: string,
    currencyId: string,
    limit: number = 100,
  ): Promise<Array<{ ref_type: string; ref_id: number; direction: string; amount: string; created_at: Date }>> {
    const rows = await this.dataSource.query(
      `SELECT ref_type, ref_id, direction, amount, created_at
       FROM wallet_ledger
       WHERE user_id = ? AND currency_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, currencyId, limit],
    );
    return (rows || []).map((r: any) => ({
      ref_type: r.ref_type,
      ref_id: Number(r.ref_id),
      direction: r.direction,
      amount: String(r.amount ?? '0'),
      created_at: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    }));
  }

  /**
   * Double-entry accounting: create both CREDIT and DEBIT entries for same ref
   */
  async createDoubleEntry(
    base: Omit<LedgerEntryInput, 'direction'>,
    manager?: EntityManager,
  ): Promise<[WalletLedger, WalletLedger]> {
    const credit = await this.createEntry(
      { ...base, direction: 'CREDIT' },
      manager,
    );
    const debit = await this.createEntry(
      { ...base, direction: 'DEBIT' },
      manager,
    );

    return [credit, debit];
  }
}
