import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import type { TransactionContext } from '@/common/types/transaction-context';
import { newUuid } from '@/common/utils/uuid.util';
import { Wallet } from '@/entities/wallet.entity';
import type { WalletRepositoryPort } from '@/modules/wallets/domain/ports';

function toEntityManager(ctx: TransactionContext): EntityManager {
  return ctx as unknown as EntityManager;
}

type QueryRunnerLike = Pick<DataSource, 'query'> | Pick<EntityManager, 'query'>;
type WalletRow = Record<string, unknown>;

@Injectable()
export class WalletRepositoryImpl extends BaseRepository<Wallet> implements WalletRepositoryPort {
  constructor(dataSource: DataSource) {
    super(Wallet, dataSource);
  }

  async findByUser(
    userId: string,
    includeZero: boolean = true,
  ): Promise<Array<Wallet & { currency_symbol: string; currency_name: string }>> {
    const rows = await this.dataSource.query(
      `SELECT w.wallet_id, w.user_id, w.currency_id, w.available, w.frozen, w.updated_at,
              c.symbol AS currency_symbol, c.name AS currency_name
       FROM wallets w
       INNER JOIN currencies c ON c.currency_id = w.currency_id
       WHERE w.user_id = $1
         AND ($2::boolean = true OR (w.available > 0 OR w.frozen > 0))
       ORDER BY c.symbol`,
      [userId, includeZero],
    );

    return (rows || []).map((row: WalletRow) => ({
      ...this.mapRowToWallet(row),
      currency_symbol: String(row.currency_symbol ?? ''),
      currency_name: String(row.currency_name ?? ''),
    }));
  }

  async findByUserCurrency(
    userId: string,
    currencyId: string,
    ctx?: TransactionContext,
  ): Promise<Wallet | null> {
    const runner = ctx ? toEntityManager(ctx) : this.dataSource;
    const rows = await runner.query(
      `SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
       FROM wallets
       WHERE user_id = $1 AND currency_id = $2
       LIMIT 1`,
      [userId, currencyId],
    );
    return rows?.[0] ? this.mapRowToWallet(rows[0]) : null;
  }

  async getOrCreateForUpdate(
    userId: string,
    currencyId: string,
    ctx: TransactionContext,
  ): Promise<Wallet> {
    const manager = toEntityManager(ctx);
    let row = await this.selectForUpdate(manager, userId, currencyId);

    if (!row) {
      await manager.query(
        `INSERT INTO wallets (wallet_id, user_id, currency_id, available, frozen, updated_at)
         VALUES ($1, $2, $3, 0, 0, NOW())
         ON CONFLICT (user_id, currency_id) DO NOTHING`,
        [newUuid(), userId, currencyId],
      );
      row = await this.selectForUpdate(manager, userId, currencyId);
    }

    if (!row) {
      this.logger.error(
        `getOrCreateForUpdate: wallet still null after insert. userId=${userId}, currencyId=${currencyId}`,
      );
      throw new Error('Failed to get or create wallet');
    }

    return this.mapRowToWallet(row);
  }

  async applyBalanceDelta(
    walletId: string,
    deltaAvailable: string,
    deltaFrozen: string,
    ctx: TransactionContext,
  ): Promise<Wallet> {
    const manager = toEntityManager(ctx);
    const rows = await manager.query(
      `UPDATE wallets
       SET available = available + $2::numeric,
           frozen = frozen + $3::numeric,
           updated_at = NOW()
       WHERE wallet_id = $1
         AND available + $2::numeric >= 0
         AND frozen + $3::numeric >= 0
       RETURNING wallet_id, user_id, currency_id, available, frozen, updated_at`,
      [walletId, deltaAvailable, deltaFrozen],
    );

    const updated = rows?.[0];
    if (!updated) {
      throw new Error('Insufficient balance or wallet not found');
    }

    return this.mapRowToWallet(updated);
  }

  async findWalletPairs(
    limit: number = 100,
  ): Promise<Array<{ userId: string; currencyId: string }>> {
    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const rows = await this.dataSource.query(
      `SELECT user_id, currency_id
       FROM wallets
       GROUP BY user_id, currency_id
       ORDER BY MAX(updated_at) DESC
       LIMIT $1`,
      [safeLimit],
    );

    return (rows || []).map((row: WalletRow) => ({
      userId: String(row.user_id ?? ''),
      currencyId: String(row.currency_id ?? ''),
    }));
  }

  private async selectForUpdate(
    runner: QueryRunnerLike,
    userId: string,
    currencyId: string,
  ): Promise<WalletRow | null> {
    const rows = await runner.query(
      `SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
       FROM wallets
       WHERE user_id = $1 AND currency_id = $2
       LIMIT 1
       FOR UPDATE`,
      [userId, currencyId],
    );
    return (rows?.[0] as WalletRow | undefined) ?? null;
  }

  private mapRowToWallet(row: WalletRow): Wallet {
    return {
      wallet_id: String(row.wallet_id ?? ''),
      user_id: String(row.user_id ?? ''),
      currency_id: String(row.currency_id ?? ''),
      available: String(row.available ?? '0'),
      frozen: String(row.frozen ?? '0'),
      updated_at: row.updated_at as Date,
    } as Wallet;
  }
}
