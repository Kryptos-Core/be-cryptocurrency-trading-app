import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { Wallet } from '@/entities/wallet.entity';

/**
 * Wallet Repository
 * Repository Pattern: Data access abstraction for wallet entity
 * Unit of Work Pattern: Uses EntityManager for transactional consistency
 */
@Injectable()
export class WalletRepository extends BaseRepository<Wallet> {
  constructor(dataSource: DataSource) {
    super(Wallet, dataSource);
  }

  /**
   * Find all wallets for a user, with currency symbol/name.
   * When includeZero is false, excludes wallets where available and frozen are both 0.
   */
  async findByUser(
    userId: string,
    includeZero: boolean = true,
  ): Promise<Array<Wallet & { currency_symbol: string; currency_name: string }>> {
    try {
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
    } catch (error) {
      this.logger.error(`Error finding wallets by user: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Find wallet by user and currency
   */
  async findByUserCurrency(
    userId: string,
    currencyId: string,
    manager?: EntityManager,
  ): Promise<Wallet | null> {
    try {
      const result = await (manager ?? this.dataSource).query(
        'CALL sp_wallet_find_by_user_currency(?, ?)',
        [userId, currencyId],
      );
      const row = result?.[0]?.[0];
      if (!row) return null;
      return this.mapRowToWallet(row);
    } catch (error) {
      this.logger.error(
        `Error finding wallet by user ${userId} and currency ${currencyId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get or create wallet and lock row for update (pessimistic write).
   * Uses raw SQL inside transaction to avoid EntityManager.getRepository(Wallet) metadata issues.
   */
  async getOrCreateForUpdate(
    userId: string,
    currencyId: string,
    manager: EntityManager,
  ): Promise<Wallet> {
    const rows = await manager.query(
      `SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
       FROM wallets WHERE user_id = ? AND currency_id = ? LIMIT 1 FOR UPDATE`,
      [userId, currencyId],
    );

    let row = rows?.[0];
    if (!row) {
      await manager.query(
        `INSERT INTO wallets (user_id, currency_id, available, frozen) VALUES (?, ?, '0', '0')`,
        [userId, currencyId],
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

  /**
   * Apply balance delta with safety checks (no negative balances)
   * Returns updated wallet row
   */
  async applyBalanceDelta(
    walletId: string,
    deltaAvailable: string,
    deltaFrozen: string,
    manager: EntityManager,
  ): Promise<Wallet> {
    const result = await manager.query('CALL sp_wallet_apply_balance_delta(?, ?, ?)', [
      walletId,
      deltaAvailable,
      deltaFrozen,
    ]);

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

  /**
   * Fetch wallet user/currency pairs for reconciliation batch jobs.
   */
  async findWalletPairs(limit: number = 100): Promise<Array<{ userId: string; currencyId: string }>> {
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
}
