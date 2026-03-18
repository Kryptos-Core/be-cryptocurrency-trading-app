import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { newUuid } from '@/common/utils/uuid.util';
import { User } from '@/entities/user.entity';
import { UserRole } from '@/common/enums';
import { UserFilterDto } from '../dto/user-filter.dto';

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
   * Get all users with pagination (legacy, no filters)
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ users: User[]; total: number }> {
    return this.findAllWithFilters({ page, limit });
  }

  /**
   * Get users with search/filter/sort — uses TypeORM QueryBuilder for dynamic conditions
   */
  async findAllWithFilters(
    filters: UserFilterDto,
  ): Promise<{ users: User[]; total: number; page: number; limit: number }> {
    try {
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 20;
      const skip = (page - 1) * limit;

      const qb = this.dataSource
        .getRepository(User)
        .createQueryBuilder('u')
        .select([
          'u.user_id',
          'u.email',
          'u.first_name',
          'u.last_name',
          'u.role',
          'u.status',
          'u.avatar_url',
          'u.two_fa_enabled',
          'u.created_at',
        ]);

      if (filters.search) {
        const s = `%${filters.search.trim()}%`;
        qb.andWhere(
          '(u.email LIKE :s OR u.first_name LIKE :s OR u.last_name LIKE :s)',
          { s },
        );
      }

      if (filters.email) {
        qb.andWhere('u.email = :email', { email: filters.email.toLowerCase().trim() });
      }

      if (filters.role) {
        qb.andWhere('u.role = :role', { role: filters.role });
      }

      if (filters.status) {
        qb.andWhere('u.status = :status', { status: filters.status });
      }

      const sortColumn = filters.sortBy ?? 'created_at';
      const sortDir = filters.sortOrder ?? 'DESC';
      qb.orderBy(`u.${sortColumn}`, sortDir);

      const [users, total] = await qb.skip(skip).take(limit).getManyAndCount();

      return { users, total, page, limit };
    } catch (error) {
      this.logger.error('Error finding users with filters', error);
      throw error;
    }
  }

  /**
   * Find all security change requests for a specific user (all statuses, paginated)
   */
  async findSecurityChangesByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    items: Array<{
      request_id: string;
      change_type: string;
      status: string;
      requested_at: Date;
      reviewed_at: Date | null;
      reviewed_by: string | null;
      review_note: string | null;
    }>;
    total: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      const rows = await this.dataSource.query(
        `SELECT request_id, change_type, status, requested_at, reviewed_at, reviewed_by, review_note
         FROM user_security_change_requests
         WHERE user_id = ?
         ORDER BY requested_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, skip],
      );
      const countResult = await this.dataSource.query(
        'SELECT COUNT(*) AS total FROM user_security_change_requests WHERE user_id = ?',
        [userId],
      );
      const total = Number(countResult[0]?.total ?? 0);
      return { items: rows ?? [], total };
    } catch (error) {
      this.logger.error(`Error finding security changes for user: ${userId}`, error);
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

  /**
   * Update only first_name, last_name (profile basic)
   */
  async updateProfileBasic(
    userId: string,
    firstName: string | null,
    lastName: string | null,
  ): Promise<number> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_update_profile_basic(?, ?, ?)',
        [userId, firstName ?? null, lastName ?? null],
      );
      const affected = result[0]?.[0]?.affected ?? 0;
      return Number(affected);
    } catch (error) {
      this.logger.error(`Error updating profile basic: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Update avatar URL and public_id
   */
  async updateAvatar(
    userId: string,
    avatarUrl: string | null,
    avatarPublicId: string | null,
  ): Promise<number> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_update_avatar(?, ?, ?)',
        [userId, avatarUrl ?? null, avatarPublicId ?? null],
      );
      const affected = result[0]?.[0]?.affected ?? 0;
      return Number(affected);
    } catch (error) {
      this.logger.error(`Error updating avatar: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Create a security change request (PENDING)
   */
  async createSecurityChangeRequest(
    requestId: string,
    userId: string,
    changeType: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    try {
      await this.dataSource.query(
        'CALL sp_user_security_change_request_create(?, ?, ?, ?)',
        [requestId, userId, changeType, JSON.stringify(payload)],
      );
      return requestId;
    } catch (error) {
      this.logger.error(`Error creating security change request: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Find all PENDING security change requests (for reviewers)
   */
  async findPendingSecurityChangeRequests(): Promise<
    Array<{
      request_id: string;
      user_id: string;
      change_type: string;
      payload_json: string;
      requested_at: Date;
      user_email: string;
      first_name: string | null;
      last_name: string | null;
    }>
  > {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_security_change_request_find_pending()',
      );
      return result[0] ?? [];
    } catch (error) {
      this.logger.error('Error finding pending security change requests', error);
      throw error;
    }
  }

  /**
   * Review (approve/reject) a security change request
   */
  async reviewSecurityChangeRequest(
    requestId: string,
    reviewedBy: string,
    approve: boolean,
    reviewNote: string | null,
  ): Promise<{ request_id: string; user_id: string; status: string } | null> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_user_security_change_request_review(?, ?, ?, ?)',
        [requestId, reviewedBy, approve ? 1 : 0, reviewNote ?? null],
      );
      return result[0]?.[0] ?? null;
    } catch (error) {
      this.logger.error(`Error reviewing security change request: ${requestId}`, error);
      throw error;
    }
  }

  /**
   * Save / clear FCM device token for push notifications
   */
  async saveFcmToken(userId: string, fcmToken: string | null): Promise<void> {
    try {
      await this.dataSource.query(
        'UPDATE users SET fcm_token = ? WHERE user_id = ?',
        [fcmToken, userId],
      );
    } catch (error) {
      this.logger.error(`Error saving FCM token for user: ${userId}`, error);
      throw error;
    }
  }
}
