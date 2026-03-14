import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { newUuid } from '@/common/utils/uuid.util';
import { User } from '@/entities/user.entity';
import { UserRole } from '@/common/enums';

/**
 * Users Repository - Data Access Layer
 * Sử dụng Stored Procedures để:
 * - Tăng security (SQL injection protection)
 * - Tăng performance (DB-level optimization)
 * - Tách biệt business logic từ database logic
 * 
 * Áp dụng Repository Pattern + Database Procedure Pattern
 */
@Injectable()
export class UsersRepository {
  private readonly logger = new Logger(UsersRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Find user by ID using stored procedure (UUID string)
   */
  async findById(userId: string): Promise<User | null> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_find_by_id(?)',
        [userId],
      );
      
      // Stored procedure returns array of results
      // First element is the actual result set
      return result[0]?.[0] || null;
    } catch (error) {
      this.logger.error(`Error finding user by ID: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Find user by email (used for login)
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
   * Get all users with pagination
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ users: User[]; total: number }> {
    try {
      const skip = (page - 1) * limit;

      // Get users
      const usersResult = await this.dataSource.query(
        'CALL sp_user_find_all(?, ?)',
        [skip, limit],
      );

      // Get total count
      const countResult = await this.dataSource.query('CALL sp_user_count()');

      const users = usersResult[0] || [];
      const total = countResult[0]?.[0]?.total || 0;

      return { users, total };
    } catch (error) {
      this.logger.error('Error finding all users', error);
      throw error;
    }
  }

  /**
   * Create new user (UUID v7)
   */
  async create(email: string, passwordHash: string): Promise<User> {
    try {
      const userId = newUuid();
      await this.dataSource.query(
        'CALL sp_user_create(?, ?, ?, ?, ?, ?)',
        [userId, email.toLowerCase(), passwordHash, null, null, UserRole.TRADER],
      );
      return this.findById(userId) as Promise<User>;
    } catch (error) {
      this.logger.error(`Error creating user: ${email}`, error);
      throw error;
    }
  }

  /**
   * Update user
   */
  async update(
    userId: string,
    updates: { email?: string; status?: string; role?: UserRole },
  ): Promise<void> {
    try {
      await this.dataSource.query(
        'CALL sp_user_update(?, ?, ?, ?)',
        [
          userId,
          updates.email ? updates.email.toLowerCase() : null,
          updates.status || null,
          updates.role || null,
        ],
      );

      this.logger.log(`User updated: ${userId}`);
    } catch (error) {
      this.logger.error(`Error updating user: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Delete user (soft delete - set status to BANNED)
   */
  async delete(userId: string): Promise<void> {
    try {
      await this.dataSource.query('CALL sp_user_delete(?)', [userId]);
      this.logger.log(`User deleted (soft): ${userId}`);
    } catch (error) {
      this.logger.error(`Error deleting user: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getStatistics(): Promise<{
    total: number;
    active: number;
    banned: number;
    pending: number;
  }> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_get_statistics()',
      );

      const stats = result[0]?.[0] || {
        total: 0,
        active: 0,
        banned: 0,
        pending: 0,
      };

      return stats;
    } catch (error) {
      this.logger.error('Error getting user statistics', error);
      throw error;
    }
  }

  /**
   * Check if email exists (excluding specific user ID)
   */
  async emailExists(email: string, excludeUserId?: string): Promise<boolean> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_email_exists(?, ?)',
        [email.toLowerCase(), excludeUserId || null],
      );

      const count = result[0]?.[0]?.count || 0;
      return count > 0;
    } catch (error) {
      this.logger.error(`Error checking email: ${email}`, error);
      throw error;
    }
  }
}
