import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { USER_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { spFirstRow, spFirstValue } from '@/common/database/stored-procedure-result.util';
import type { User } from '@/entities/user.entity';
import type { AuthRepositoryPort } from '@/modules/auth/domain/ports';

/**
 * Auth Repository Implementation — stored-procedure-backed persistence.
 * Implements AuthRepositoryPort from domain layer.
 */
@Injectable()
export class AuthRepositoryImpl implements AuthRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  async findByLinkedWallet(chain: string, address: string): Promise<User | null> {
    const result = await this.dataSource.query(
      `CALL ${USER_STORE_PROCEDURE.FIND_BY_LINKED_WALLET}(?, ?)`,
      [chain, address],
    );
    return spFirstRow<User>(result);
  }

  async createWalletOnlyUser(
    userId: string,
    email: string,
    passwordHash: string,
    chain: string,
    address: string,
  ): Promise<User> {
    await this.dataSource.query(`CALL ${USER_STORE_PROCEDURE.CREATE_WALLET_ONLY}(?, ?, ?, ?, ?)`, [
      userId,
      email,
      passwordHash,
      chain,
      address,
    ]);
    const userResult = await this.dataSource.query(`CALL ${USER_STORE_PROCEDURE.FIND_BY_ID}(?)`, [
      userId,
    ]);
    const createdUser = spFirstRow<User>(userResult);
    if (!createdUser) {
      throw new Error(`Created wallet-only user ${userId} was not found`);
    }
    return createdUser;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.dataSource.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [
      passwordHash,
      userId,
    ]);
  }

  async setTwoFaEnabled(userId: string, enabled: boolean): Promise<number> {
    const result = await this.dataSource.query(`CALL ${USER_STORE_PROCEDURE.SET_TWO_FA}(?, ?)`, [
      userId,
      enabled ? 1 : 0,
    ]);
    return Number(spFirstValue<number>(result, 'affected') ?? 0);
  }
}
