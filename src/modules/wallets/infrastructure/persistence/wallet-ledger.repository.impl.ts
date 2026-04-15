import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { WALLET_LEDGER_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { BaseRepository } from '@/common/repositories';
import type { TransactionContext } from '@/common/types/transaction-context';
import { WalletLedger } from '@/entities/wallet-ledger.entity';
import type { LedgerEntryInput, WalletLedgerRepositoryPort } from '@/modules/wallets/domain/ports';

function toEntityManager(ctx: TransactionContext): EntityManager {
  return ctx as unknown as EntityManager;
}

/**
 * Infrastructure: Wallet Ledger Repository (TypeORM + stored procedures)
 * Implements WalletLedgerRepositoryPort for the persistence layer.
 */
@Injectable()
export class WalletLedgerRepositoryImpl
  extends BaseRepository<WalletLedger>
  implements WalletLedgerRepositoryPort
{
  constructor(dataSource: DataSource) {
    super(WalletLedger, dataSource);
  }

  async createEntry(entry: LedgerEntryInput, ctx?: TransactionContext): Promise<WalletLedger> {
    const runner = ctx ? toEntityManager(ctx) : this.dataSource;
    const result = await runner.query(
      `CALL ${WALLET_LEDGER_STORE_PROCEDURE.CREATE}(?, ?, ?, ?, ?, ?, ?)`,
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

  async findRecentByUserAndCurrency(
    userId: string,
    currencyId: string,
    limit: number = 100,
  ): Promise<
    Array<{ ref_type: string; ref_id: number; direction: string; amount: string; created_at: Date }>
  > {
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

  async createDoubleEntry(
    base: Omit<LedgerEntryInput, 'direction'>,
    ctx?: TransactionContext,
  ): Promise<[WalletLedger, WalletLedger]> {
    const credit = await this.createEntry({ ...base, direction: 'CREDIT' }, ctx);
    const debit = await this.createEntry({ ...base, direction: 'DEBIT' }, ctx);
    return [credit, debit];
  }
}
