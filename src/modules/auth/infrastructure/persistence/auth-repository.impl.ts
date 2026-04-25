import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthRepositoryPort } from '@/modules/auth/domain/ports';
import type { UserRecord } from '@/modules/users';

/**
 * Auth Repository Implementation — PostgreSQL-native persistence.
 * Implements AuthRepositoryPort from domain layer.
 */
@Injectable()
export class AuthRepositoryImpl implements AuthRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  async findByLinkedWallet(chain: string, address: string): Promise<UserRecord | null> {
    const rows = await this.dataSource.query(
      `SELECT u.*
         FROM users u
         INNER JOIN linked_wallets lw ON lw.user_id = u.user_id
        WHERE lw.chain = $1
          AND lw.address = $2
          AND lw.status = 'VERIFIED'
        ORDER BY lw.linked_at ASC NULLS LAST, lw.created_at ASC
        LIMIT 1`,
      [chain, address],
    );

    return (rows?.[0] as UserRecord | undefined) ?? null;
  }

  async createWalletOnlyUser(
    userId: string,
    email: string,
    passwordHash: string,
    chain: string,
    address: string,
  ): Promise<UserRecord> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO users (
            user_id,
            email,
            password_hash,
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
          VALUES ($1, $2, $3, 'ACTIVE', 'TRADER', NULL, NULL, NULL, 0, 0, 0, NOW())`,
        [userId, email.toLowerCase(), passwordHash],
      );

      await manager.query(
        `INSERT INTO linked_wallets (
            link_id,
            user_id,
            chain,
            address,
            label,
            status,
            linked_at,
            created_at
          )
          VALUES ($1, $2, $3, $4, NULL, 'VERIFIED', NOW(), NOW())
          ON CONFLICT (user_id, chain, address)
          DO UPDATE
            SET status = 'VERIFIED',
                linked_at = EXCLUDED.linked_at`,
        [userId, userId, chain, address],
      );

      const rows = await manager.query(`SELECT * FROM users WHERE user_id = $1 LIMIT 1`, [userId]);
      const createdUser = (rows?.[0] as UserRecord | undefined) ?? null;
      if (!createdUser) {
        throw new Error(`Created wallet-only user ${userId} was not found`);
      }
      return createdUser;
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.dataSource.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [
      passwordHash,
      userId,
    ]);
  }

  async setTwoFaEnabled(userId: string, enabled: boolean): Promise<number> {
    const result = await this.dataSource.query(
      `UPDATE users
          SET two_fa_enabled = $2,
              email_verified = CASE WHEN $2 = 1 THEN 1 ELSE email_verified END
        WHERE user_id = $1
      RETURNING user_id`,
      [userId, enabled ? 1 : 0],
    );
    return Array.isArray(result) ? result.length : 0;
  }
}
