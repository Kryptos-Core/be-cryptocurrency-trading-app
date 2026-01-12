import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '@/entities/user.entity';

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
   * Find user by ID using stored procedure
   */
  async findById(userId: number): Promise<User | null> {
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
   * Create new user
   */
  async create(email: string, passwordHash: string): Promise<User> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_create(?, ?)',
        [email.toLowerCase(), passwordHash],
      );

      // Return full user object with ID
      const userId = result[0]?.[0]?.user_id;
      
      if (!userId) {
        throw new Error('Failed to create user - no ID returned');
      }

      // Fetch created user
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
    userId: number,
    updates: { email?: string; status?: string },
  ): Promise<void> {
    try {
      await this.dataSource.query(
        'CALL sp_user_update(?, ?, ?)',
        [
          userId,
          updates.email ? updates.email.toLowerCase() : null,
          updates.status || null,
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
  async delete(userId: number): Promise<void> {
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
  async emailExists(email: string, excludeUserId?: number): Promise<boolean> {
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
