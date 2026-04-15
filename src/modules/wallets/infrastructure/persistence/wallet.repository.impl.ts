import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { WALLET_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { BaseRepository } from '@/common/repositories';
import type { TransactionContext } from '@/common/types/transaction-context';
import { newUuid } from '@/common/utils/uuid.util';
import { Wallet } from '@/entities/wallet.entity';
import type { WalletRepositoryPort } from '@/modules/wallets/domain/ports';

function toEntityManager(ctx: TransactionContext): EntityManager {
  return ctx as unknown as EntityManager;
}

/**
 * Infrastructure: Wallet Repository (TypeORM + stored procedures)
 * Implements WalletRepositoryPort for the persistence layer.
 */
@Injectable()
export class WalletRepositoryImpl extends BaseRepository<Wallet> implements WalletRepositoryPort {
  constructor(dataSource: DataSource) {
    super(Wallet, dataSource);
  }

  async findByUser(
    userId: string,
    includeZero: boolean = true,
  ): Promise<Array<Wallet & { currency_symbol: string; currency_name: string }>> {
    const sql = `
        SELECT w.wallet_id, w.user_id, w.currency_id, w.available, w.frozen, w.updated_at,
               c.symbol AS currency_symbol, c.name AS currency_name
        FROM wallets w
        INNER JOIN currencies c ON c.currency_id = w.currency_id
        WHERE w.user_id = ?
        ${includeZero ? '' : 'AND (w.available > 0 OR w.frozen > 0)'}
        ORDER BY c.symbol
      `;
    const rows = await this.dataSource.query(sql, [userId]);
    return (rows || []).map((row: any) => ({
      ...this.mapRowToWallet(row),
      currency_symbol: row.currency_symbol ?? '',
      currency_name: row.currency_name ?? '',
    }));
  }

  async findByUserCurrency(
    userId: string,
    currencyId: string,
    ctx?: TransactionContext,
  ): Promise<Wallet | null> {
    const runner = ctx ? toEntityManager(ctx) : this.dataSource;
    const result = await runner.query(
      `CALL ${WALLET_STORE_PROCEDURE.FIND_BY_USER_CURRENCY}(?, ?)`,
      [userId, currencyId],
    );
    const row = result?.[0]?.[0];
    if (!row) return null;
    return this.mapRowToWallet(row);
  }

  async getOrCreateForUpdate(
    userId: string,
    currencyId: string,
    ctx: TransactionContext,
  ): Promise<Wallet> {
    const manager = toEntityManager(ctx);
    const rows = await manager.query(
      `SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
       FROM wallets WHERE user_id = ? AND currency_id = ? LIMIT 1 FOR UPDATE`,
      [userId, currencyId],
    );

    let row = rows?.[0];
    if (!row) {
      const walletId = newUuid();
      await manager.query(
        `INSERT INTO wallets (wallet_id, user_id, currency_id, available, frozen) VALUES (?, ?, ?, '0', '0')`,
        [walletId, userId, currencyId],
      );
      const after = await manager.query(
        `SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
         FROM wallets WHERE user_id = ? AND currency_id = ? LIMIT 1 FOR UPDATE`,
        [userId, currencyId],
      );
      row = after?.[0];
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
    const result = await manager.query(
      `CALL ${WALLET_STORE_PROCEDURE.APPLY_BALANCE_DELTA}(?, ?, ?)`,
      [walletId, deltaAvailable, deltaFrozen],
    );

    const affected = result?.[0]?.[0]?.affected ?? 0;
    const updated = result?.[1]?.[0] as Wallet | undefined;

    if (!affected) {
      throw new Error('Insufficient balance or wallet not found');
    }

    if (!updated) {
      throw new Error('Failed to load updated wallet');
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
       LIMIT ?`,
      [safeLimit],
    );

    return (rows || []).map((row: any) => ({
      userId: String(row.user_id),
      currencyId: String(row.currency_id),
    }));
  }

  private mapRowToWallet(row: any): Wallet {
    return {
      wallet_id: String(row.wallet_id ?? ''),
      user_id: String(row.user_id ?? ''),
      currency_id: String(row.currency_id ?? ''),
      available: row.available ?? '0',
      frozen: row.frozen ?? '0',
      updated_at: row.updated_at,
    } as Wallet;
  }
}
