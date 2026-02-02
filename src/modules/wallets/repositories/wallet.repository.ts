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
   * Find wallet by user and currency
   */
  async findByUserCurrency(
    userId: number,
    currencyId: number,
    manager?: EntityManager,
  ): Promise<Wallet | null> {
    try {
      const result = await (manager ?? this.dataSource).query(
        'CALL sp_wallet_find_by_user_currency(?, ?)',
        [userId, currencyId],
      );
      return result?.[0]?.[0] || null;
    } catch (error) {
      this.logger.error(
        `Error finding wallet by user ${userId} and currency ${currencyId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get or create wallet and lock row for update (pessimistic write)
   * Transaction safety: ensures consistent balance updates
   */
  async getOrCreateForUpdate(
    userId: number,
    currencyId: number,
    manager: EntityManager,
  ): Promise<Wallet> {
    const result = await manager.query('CALL sp_wallet_get_or_create_for_update(?, ?)', [
      userId,
      currencyId,
    ]);

    const wallet = result?.[0]?.[0] as Wallet | undefined;
    if (!wallet) {
      throw new Error('Failed to get or create wallet');
    }

    return wallet;
  }

  /**
   * Apply balance delta with safety checks (no negative balances)
   * Returns updated wallet row
   */
  async applyBalanceDelta(
    walletId: number,
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

    return updated;
  }
}
