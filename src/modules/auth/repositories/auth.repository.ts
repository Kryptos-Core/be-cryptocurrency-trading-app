import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '@/entities/user.entity';

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
   * Create new user (for registration)
   * Procedure returns the newly created user_id
   */
  async createUser(email: string, passwordHash: string): Promise<User> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_create(?, ?)',
        [email.toLowerCase(), passwordHash],
      );

      const userId = result[0]?.[0]?.user_id;

      if (!userId) {
        throw new Error('Failed to create user - no ID returned');
      }

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
}
