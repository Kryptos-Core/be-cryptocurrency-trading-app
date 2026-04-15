import type { User } from '@/entities/user.entity';

/**
 * Auth Repository Port — domain contract for authentication persistence.
 * Infrastructure implements this via stored procedures / TypeORM.
 */
export interface AuthRepositoryPort {
  /** Find user by linked wallet (chain + address) */
  findByLinkedWallet(chain: string, address: string): Promise<User | null>;

  /** Create wallet-only user and link wallet in one transaction */
  createWalletOnlyUser(
    userId: string,
    email: string,
    passwordHash: string,
    chain: string,
    address: string,
  ): Promise<User>;

  /** Update user password (direct change, no approval) */
  updatePassword(userId: string, passwordHash: string): Promise<void>;

  /** Enable/disable 2FA for user */
  setTwoFaEnabled(userId: string, enabled: boolean): Promise<number>;
}
