import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { USER_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { spFirstRow, spFirstValue } from '@/common/database/stored-procedure-result.util';
import type { User } from '@/entities/user.entity';

/**
 * Auth Repository - Data Access Layer for Authentication
 * Sử dụng Stored Procedures để xử lý auth-related database operations
 */
@Injectable()
export class AuthRepository {
  private readonly logger = new Logger(AuthRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Find user by linked wallet (chain + address), status = VERIFIED
   */
  async findByLinkedWallet(chain: string, address: string): Promise<User | null> {
    try {
      const result = await this.dataSource.query(
        `CALL ${USER_STORE_PROCEDURE.FIND_BY_LINKED_WALLET}(?, ?)`,
        [chain, address],
      );
      return spFirstRow<User>(result);
    } catch (error) {
      this.logger.error(`Error finding user by linked wallet: ${chain}/${address}`, error);
      throw error;
    }
  }

  /**
   * Create wallet-only user and link wallet in one transaction
   */
  async createWalletOnlyUser(
    userId: string,
    email: string,
    passwordHash: string,
    chain: string,
    address: string,
  ): Promise<User> {
    try {
      await this.dataSource.query(
        `CALL ${USER_STORE_PROCEDURE.CREATE_WALLET_ONLY}(?, ?, ?, ?, ?)`,
        [userId, email, passwordHash, chain, address],
      );
      const userResult = await this.dataSource.query(`CALL ${USER_STORE_PROCEDURE.FIND_BY_ID}(?)`, [
        userId,
      ]);
      const createdUser = spFirstRow<User>(userResult);
      if (!createdUser) {
        throw new Error(`Created wallet-only user ${userId} was not found`);
      }
      return createdUser;
    } catch (error) {
      this.logger.error(`Error creating wallet-only user: ${email}`, error);
      throw error;
    }
  }

  /**
   * Update user password (direct change, no approval)
   */
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    try {
      await this.dataSource.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [
        passwordHash,
        userId,
      ]);
    } catch (error) {
      this.logger.error(`Error updating password for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Enable/disable 2FA for user
   */
  async setTwoFaEnabled(userId: string, enabled: boolean): Promise<number> {
    try {
      const result = await this.dataSource.query(`CALL ${USER_STORE_PROCEDURE.SET_TWO_FA}(?, ?)`, [
        userId,
        enabled ? 1 : 0,
      ]);
      return Number(spFirstValue<number>(result, 'affected') ?? 0);
    } catch (error) {
      this.logger.error(`Error updating 2FA status for user ${userId}`, error);
      throw error;
    }
  }
}
