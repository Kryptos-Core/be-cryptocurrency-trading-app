import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import type { TransactionContext } from '@/common/types/transaction-context';
import { newUuid } from '@/common/utils/uuid.util';
import { WalletLedger } from '@/entities/wallet-ledger.entity';
import type { LedgerEntryInput, WalletLedgerRepositoryPort } from '@/modules/wallets/domain/ports';

function toEntityManager(ctx: TransactionContext): EntityManager {
  return ctx as unknown as EntityManager;
}

type QueryRunnerLike = Pick<DataSource, 'query'> | Pick<EntityManager, 'query'>;
type WalletLedgerRow = Record<string, unknown>;

@Injectable()
export class WalletLedgerRepositoryImpl
  extends BaseRepository<WalletLedger>
  implements WalletLedgerRepositoryPort
{
  constructor(dataSource: DataSource) {
    super(WalletLedger, dataSource);
  }

  async createEntry(entry: LedgerEntryInput, ctx?: TransactionContext): Promise<WalletLedger> {
    const runner: QueryRunnerLike = ctx ? toEntityManager(ctx) : this.dataSource;

    const walletRows = await runner.query(
      `SELECT wallet_id
       FROM wallets
       WHERE user_id = $1 AND currency_id = $2
       LIMIT 1`,
      [entry.userId, entry.currencyId],
    );
    const walletId = walletRows?.[0]?.wallet_id;
    if (!walletId) {
      throw new Error('Failed to create wallet ledger entry');
    }

    const rows = await runner.query(
      `INSERT INTO wallet_ledger (
         ledger_id, user_id, currency_id, wallet_id, ref_type, ref_id, direction, amount, balance_after, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
       )
       RETURNING ledger_id, user_id, currency_id, wallet_id, ref_type, ref_id, direction, amount, balance_after, created_at`,
      [
        newUuid(),
        entry.userId,
        entry.currencyId,
        walletId,
        entry.refType,
        String(entry.refId),
        entry.direction,
        entry.amount,
        entry.balanceAfter,
      ],
    );

    const created = rows?.[0] as WalletLedgerRow | undefined;
    if (!created) {
      throw new Error('Failed to create wallet ledger entry');
    }

    return created as unknown as WalletLedger;
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
       WHERE user_id = $1 AND currency_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, currencyId, limit],
    );
    return (rows || []).map((r: WalletLedgerRow) => ({
      ref_type: String(r.ref_type ?? ''),
      ref_id: Number(r.ref_id ?? 0),
      direction: String(r.direction ?? ''),
      amount: String(r.amount ?? '0'),
      created_at: r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at ?? '')),
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
