import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '@/common/enums';
import { calcSkip } from '@/common/utils/pagination.util';
import { newUuid } from '@/common/utils/uuid.util';
import { User } from '@/entities/user.entity';
import type { BlockchainOnchainTransactionRecord } from '@/modules/blockchain';
import { OnchainTransaction } from '@/modules/blockchain';
import type { UserFilterDto } from '@/modules/users/dto/user-filter.dto';

type SortColumn = 'created_at' | 'email' | 'first_name';

type UserSecurityChangeItem = {
  request_id: string;
  change_type: string;
  status: string;
  requested_at: Date;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  review_note: string | null;
};

type PendingSecurityChangeRequest = {
  request_id: string;
  user_id: string;
  change_type: string;
  payload_json: string;
  requested_at: Date;
  user_email: string;
  first_name: string | null;
  last_name: string | null;
};

type ReviewedSecurityChangeRequest = {
  request_id: string;
  user_id: string;
  status: string;
};

/**
 * Users Repository - PostgreSQL-native data access layer.
 */
@Injectable()
export class UsersRepository {
  private readonly logger = new Logger(UsersRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  async findById(userId: string): Promise<User | null> {
    const rows = await this.dataSource.query('SELECT * FROM users WHERE user_id = $1 LIMIT 1', [
      userId,
    ]);
    return (rows?.[0] as User | undefined) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.dataSource.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [
      email.toLowerCase(),
    ]);
    return (rows?.[0] as User | undefined) ?? null;
  }

  async findAll(page: number = 1, limit: number = 10): Promise<{ users: User[]; total: number }> {
    const result = await this.findAllWithFilters({ page, limit });
    return { users: result.users, total: result.total };
  }

  async findAllWithFilters(
    filters: UserFilterDto,
  ): Promise<{ users: User[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = calcSkip(page, limit);

    const params: Array<string | number> = [];
    const whereClauses: string[] = [];

    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`;
      params.push(s);
      const idx = params.length;
      whereClauses.push(
        `(u.email ILIKE $${idx} OR u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx})`,
      );
    }

    if (filters.email?.trim()) {
      params.push(filters.email.toLowerCase().trim());
      whereClauses.push(`u.email = $${params.length}`);
    }

    if (filters.role) {
      params.push(filters.role);
      whereClauses.push(`u.role = $${params.length}`);
    }

    if (filters.status) {
      params.push(filters.status);
      whereClauses.push(`u.status = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const sortColumn = this.resolveSortColumn(filters.sortBy);
    const sortDir = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM users u ${whereSql}`,
      params,
    );

    const listParams = [...params, limit, skip];
    const limitIndex = listParams.length - 1;
    const offsetIndex = listParams.length;
    const users = await this.dataSource.query(
      `SELECT
          u.user_id,
          u.email,
          u.password_hash,
          u.first_name,
          u.last_name,
          u.two_fa_secret,
          u.status,
          u.role,
          u.identity_verified,
          u.email_verified,
          u.avatar_url,
          u.avatar_public_id,
          u.fcm_token,
          u.two_fa_enabled,
          u.created_at
         FROM users u
         ${whereSql}
         ORDER BY u.${sortColumn} ${sortDir}
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      listParams,
    );

    return {
      users: (users ?? []) as User[],
      total: Number(countRows?.[0]?.total ?? 0),
      page,
      limit,
    };
  }

  async findTestUsersByRole(role: UserRole, search?: string, limit: number = 20): Promise<User[]> {
    const params: Array<string | number> = [role, limit];
    let whereSearch = '';
    if (search?.trim()) {
      params.splice(1, 0, `%${search.trim()}%`);
      whereSearch = ` AND (u.email ILIKE $2 OR u.first_name ILIKE $2 OR u.last_name ILIKE $2)`;
      params[2] = limit;
    }

    const limitIndex = search?.trim() ? 3 : 2;
    const rows = await this.dataSource.query(
      `SELECT *
         FROM users u
        WHERE u.role = $1 AND u.status = 'ACTIVE'${whereSearch}
        ORDER BY u.created_at DESC
        LIMIT $${limitIndex}`,
      params,
    );

    return (rows ?? []) as User[];
  }

  async findSecurityChangesByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ items: UserSecurityChangeItem[]; total: number }> {
    const skip = calcSkip(page, limit);
    const rows = await this.dataSource.query(
      `SELECT request_id, change_type, status, requested_at, reviewed_at, reviewed_by, review_note
         FROM user_security_change_requests
        WHERE user_id = $1
        ORDER BY requested_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, skip],
    );
    const countResult = await this.dataSource.query(
      'SELECT COUNT(*)::int AS total FROM user_security_change_requests WHERE user_id = $1',
      [userId],
    );
    const total = Number(countResult?.[0]?.total ?? 0);
    return { items: (rows ?? []) as UserSecurityChangeItem[], total };
  }

  async findOnchainTransactionsByUser(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<{ items: BlockchainOnchainTransactionRecord[]; total: number }> {
    const [items, total] = await this.dataSource
      .getRepository(OnchainTransaction)
      .createQueryBuilder('tx')
      .where('tx.user_id = :userId', { userId })
      .orderBy('tx.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    return { items, total };
  }

  async createUser(
    email: string,
    passwordHash: string,
    firstName?: string | null,
    lastName?: string | null,
    role: UserRole = UserRole.TRADER,
  ): Promise<User> {
    const userId = newUuid();
    await this.dataSource.query(
      `INSERT INTO users (
          user_id,
          email,
          password_hash,
          first_name,
          last_name,
          status,
          role,
          avatar_url,
          avatar_public_id,
          fcm_token,
          two_fa_enabled,
          identity_verified,
          email_verified,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, NULL, NULL, NULL, 0, 0, 0, NOW())`,
      [userId, email.toLowerCase(), passwordHash, firstName ?? null, lastName ?? null, role],
    );

    const createdUser = await this.findById(userId);
    if (!createdUser) {
      throw new Error(`Created user ${userId} was not found`);
    }
    return createdUser;
  }

  async create(email: string, passwordHash: string): Promise<User> {
    return this.createUser(email, passwordHash, null, null, UserRole.TRADER);
  }

  async update(
    userId: string,
    updates: { email?: string; status?: string; role?: UserRole; identityVerified?: boolean },
  ): Promise<void> {
    const setClauses: string[] = [];
    const params: Array<string | number> = [userId];

    if (updates.email !== undefined) {
      params.push(updates.email ? updates.email.toLowerCase() : (null as unknown as string));
      setClauses.push(`email = $${params.length}`);
    }

    if (updates.status !== undefined) {
      params.push(updates.status ?? null);
      setClauses.push(`status = $${params.length}`);
    }

    if (updates.role !== undefined) {
      params.push(updates.role ?? null);
      setClauses.push(`role = $${params.length}`);
    }

    if (updates.identityVerified !== undefined) {
      params.push(updates.identityVerified ? 1 : 0);
      setClauses.push(`identity_verified = $${params.length}`);
    }

    if (setClauses.length === 0) {
      return;
    }

    await this.dataSource.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE user_id = $1`,
      params,
    );

    this.logger.log(`User updated: ${userId}`);
  }

  async delete(userId: string): Promise<void> {
    await this.dataSource.query(`UPDATE users SET status = 'BANNED' WHERE user_id = $1`, [userId]);
    this.logger.log(`User deleted (soft): ${userId}`);
  }

  async getStatistics(): Promise<{
    total: number;
    active: number;
    banned: number;
    pending: number;
  }> {
    const rows = await this.dataSource.query(`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END)::int AS active,
        SUM(CASE WHEN status = 'BANNED' THEN 1 ELSE 0 END)::int AS banned,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END)::int AS pending
      FROM users
    `);

    return {
      total: Number(rows?.[0]?.total ?? 0),
      active: Number(rows?.[0]?.active ?? 0),
      banned: Number(rows?.[0]?.banned ?? 0),
      pending: Number(rows?.[0]?.pending ?? 0),
    };
  }

  async emailExists(email: string, excludeUserId?: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count
         FROM users
        WHERE email = $1
          AND ($2::text IS NULL OR user_id <> $2)`,
      [email.toLowerCase(), excludeUserId ?? null],
    );

    return Number(rows?.[0]?.count ?? 0) > 0;
  }

  async setEmailVerified(userId: string, verified: boolean): Promise<void> {
    await this.dataSource.query('UPDATE users SET email_verified = $1 WHERE user_id = $2', [
      verified ? 1 : 0,
      userId,
    ]);
  }

  async updateProfileBasic(
    userId: string,
    firstName: string | null,
    lastName: string | null,
  ): Promise<number> {
    const rows = await this.dataSource.query(
      `UPDATE users
          SET first_name = COALESCE(NULLIF(BTRIM($2), ''), first_name),
              last_name = COALESCE(NULLIF(BTRIM($3), ''), last_name)
        WHERE user_id = $1
      RETURNING user_id`,
      [userId, firstName ?? null, lastName ?? null],
    );
    return Array.isArray(rows) ? rows.length : 0;
  }

  async updateAvatar(
    userId: string,
    avatarUrl: string | null,
    avatarPublicId: string | null,
  ): Promise<number> {
    const rows = await this.dataSource.query(
      `UPDATE users
          SET avatar_url = $2,
              avatar_public_id = $3
        WHERE user_id = $1
      RETURNING user_id`,
      [userId, avatarUrl ?? null, avatarPublicId ?? null],
    );
    return Array.isArray(rows) ? rows.length : 0;
  }

  async createSecurityChangeRequest(
    requestId: string,
    userId: string,
    changeType: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    await this.dataSource.query(
      `INSERT INTO user_security_change_requests (
          request_id,
          user_id,
          change_type,
          payload_json,
          status,
          requested_at,
          created_at
        )
        VALUES ($1, $2, $3, $4::jsonb, 'PENDING', NOW(), NOW())`,
      [requestId, userId, changeType, JSON.stringify(payload)],
    );
    return requestId;
  }

  async findPendingSecurityChangeRequests(): Promise<PendingSecurityChangeRequest[]> {
    const rows = await this.dataSource.query(
      `SELECT
          r.request_id,
          r.user_id,
          r.change_type,
          r.payload_json::text AS payload_json,
          r.requested_at,
          u.email AS user_email,
          u.first_name,
          u.last_name
         FROM user_security_change_requests r
         INNER JOIN users u ON u.user_id = r.user_id
        WHERE r.status = 'PENDING'
        ORDER BY r.requested_at ASC`,
    );
    return (rows ?? []) as PendingSecurityChangeRequest[];
  }

  async reviewSecurityChangeRequest(
    requestId: string,
    reviewedBy: string,
    approve: boolean,
    reviewNote: string | null,
  ): Promise<ReviewedSecurityChangeRequest | null> {
    return this.dataSource.transaction(async (manager) => {
      const requestRows = await manager.query(
        `SELECT request_id, user_id, change_type, payload_json::text AS payload_json, status
           FROM user_security_change_requests
          WHERE request_id = $1 AND status = 'PENDING'
          LIMIT 1
          FOR UPDATE`,
        [requestId],
      );

      const request =
        (requestRows?.[0] as
          | {
              request_id: string;
              user_id: string;
              change_type: string;
              payload_json: string;
              status: string;
            }
          | undefined) ?? null;

      if (!request) {
        return null;
      }

      if (approve) {
        const payload = JSON.parse(request.payload_json) as Record<string, unknown>;

        if (request.change_type === 'EMAIL_CHANGE') {
          const nextEmail =
            typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
          if (nextEmail) {
            await manager.query('UPDATE users SET email = $2 WHERE user_id = $1', [
              request.user_id,
              nextEmail,
            ]);
          }
        } else if (request.change_type === 'PASSWORD_CHANGE') {
          const nextPasswordHash =
            typeof payload.password_hash === 'string' ? payload.password_hash.trim() : '';
          if (nextPasswordHash) {
            await manager.query('UPDATE users SET password_hash = $2 WHERE user_id = $1', [
              request.user_id,
              nextPasswordHash,
            ]);
          }
        }
      }

      const resultRows = await manager.query(
        `UPDATE user_security_change_requests
            SET status = $2,
                reviewed_at = NOW(),
                reviewed_by = $3,
                review_note = NULLIF(BTRIM($4), '')
          WHERE request_id = $1
        RETURNING request_id, user_id, status`,
        [requestId, approve ? 'APPROVED' : 'REJECTED', reviewedBy, reviewNote ?? null],
      );

      return (resultRows?.[0] as ReviewedSecurityChangeRequest | undefined) ?? null;
    });
  }

  async saveFcmToken(userId: string, fcmToken: string | null): Promise<void> {
    await this.dataSource.query('UPDATE users SET fcm_token = $1 WHERE user_id = $2', [
      fcmToken,
      userId,
    ]);
  }

  private resolveSortColumn(sortBy?: SortColumn): SortColumn {
    switch (sortBy) {
      case 'email':
        return 'email';
      case 'first_name':
        return 'first_name';
      default:
        return 'created_at';
    }
  }
}
