import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { newUuid } from '@/common/utils/uuid.util';
import { User } from '@/entities/user.entity';
import { UserRole } from '@/common/enums';

/**
 * Auth Repository - Data Access Layer for Authentication
 * Sử dụng Stored Procedures để xử lý auth-related database operations
 */
@Injectable()
export class AuthRepository {
  private readonly logger = new Logger(AuthRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Find user by email (used for login and check existence)
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_find_by_email(?)',
        [email.toLowerCase()],
      );

      return result[0]?.[0] || null;
    } catch (error) {
      this.logger.error(`Error finding user by email: ${email}`, error);
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<User | null> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_find_by_id(?)',
        [userId],
      );
      return result[0]?.[0] || null;
    } catch (error) {
      this.logger.error(`Error finding user by ID: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Create new user (for registration)
   * Procedure returns the newly created user_id
   */
  async createUser(
    email: string,
    passwordHash: string,
    firstName?: string,
    lastName?: string,
    role: UserRole = UserRole.TRADER,
  ): Promise<User> {
    try {
      const userId = newUuid();
      await this.dataSource.query(
        'CALL sp_user_create(?, ?, ?, ?, ?, ?)',
        [userId, email.toLowerCase(), passwordHash, firstName || null, lastName || null, role],
      );

      // Fetch and return created user
      const userResult = await this.dataSource.query(
        'CALL sp_user_find_by_id(?)',
        [userId],
      );

      return userResult[0]?.[0];
    } catch (error) {
      this.logger.error(`Error creating user: ${email}`, error);
      throw error;
    }
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_email_exists(?, ?)',
        [email.toLowerCase(), null],
      );

      const count = result[0]?.[0]?.count || 0;
      return count > 0;
    } catch (error) {
      this.logger.error(`Error checking email: ${email}`, error);
      throw error;
    }
  }

  /**
   * Find user by linked wallet (chain + address), status = VERIFIED
   */
  async findByLinkedWallet(chain: string, address: string): Promise<User | null> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_find_by_linked_wallet(?, ?)',
        [chain, address],
      );
      return result[0]?.[0] || null;
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
        'CALL sp_user_create_wallet_only(?, ?, ?, ?, ?)',
        [userId, email, passwordHash, chain, address],
      );
      const userResult = await this.dataSource.query(
        'CALL sp_user_find_by_id(?)',
        [userId],
      );
      return userResult[0]?.[0];
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
      await this.dataSource.query(
        'UPDATE users SET password_hash = ? WHERE user_id = ?',
        [passwordHash, userId],
      );
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
      const result = await this.dataSource.query(
        'CALL sp_user_set_two_fa(?, ?)',
        [userId, enabled ? 1 : 0],
      );
      return Number(result[0]?.[0]?.affected ?? 0);
    } catch (error) {
      this.logger.error(`Error updating 2FA status for user ${userId}`, error);
      throw error;
    }
  }
}
