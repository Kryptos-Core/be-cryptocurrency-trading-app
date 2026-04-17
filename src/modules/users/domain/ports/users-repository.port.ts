import type { UserRole } from '@/common/enums';
import type { BlockchainOnchainTransactionRecord } from '@/modules/blockchain';
import type { User } from '@/entities/user.entity';

/**
 * Users Repository Port — domain contract for user persistence.
 * Infrastructure implements this via stored procedures / TypeORM.
 */
export interface UsersRepositoryPort {
  /** Find user by ID (UUID string) */
  findById(userId: string): Promise<User | null>;

  /** Find user by email (used for login) */
  findByEmail(email: string): Promise<User | null>;

  /** Get all users with pagination (legacy, no filters) */
  findAll(page?: number, limit?: number): Promise<{ users: User[]; total: number }>;

  /** Get users with search/filter/sort */
  findAllWithFilters(
    filters: any,
  ): Promise<{ users: User[]; total: number; page: number; limit: number }>;

  /** Find all security change requests for a specific user (all statuses, paginated) */
  findSecurityChangesByUserId(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{ items: any[]; total: number }>;

  /** Find paginated onchain transactions for a specific user */
  findOnchainTransactionsByUser(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<{ items: BlockchainOnchainTransactionRecord[]; total: number }>;

  /** Create new user with optional profile fields */
  createUser(
    email: string,
    passwordHash: string,
    firstName?: string | null,
    lastName?: string | null,
    role?: UserRole,
  ): Promise<User>;

  /** Create new trader user (legacy path) */
  create(email: string, passwordHash: string): Promise<User>;

  /** Update user */
  update(
    userId: string,
    updates: { email?: string; status?: string; role?: UserRole; identityVerified?: boolean },
  ): Promise<void>;

  /** Delete user (soft delete) */
  delete(userId: string): Promise<void>;

  /** Get user statistics */
  getStatistics(): Promise<{ total: number; active: number; banned: number; pending: number }>;

  /** Check if email exists (excluding specific user ID) */
  emailExists(email: string, excludeUserId?: string): Promise<boolean>;

  /** Mark email as verified via OTP */
  setEmailVerified(userId: string, verified: boolean): Promise<void>;

  /** Update only first_name, last_name (profile basic) */
  updateProfileBasic(
    userId: string,
    firstName: string | null,
    lastName: string | null,
  ): Promise<number>;

  /** Update avatar URL and public_id */
  updateAvatar(
    userId: string,
    avatarUrl: string | null,
    avatarPublicId: string | null,
  ): Promise<number>;

  /** Create a security change request (PENDING) */
  createSecurityChangeRequest(
    requestId: string,
    userId: string,
    changeType: string,
    payload: Record<string, unknown>,
  ): Promise<string>;

  /** Find all PENDING security change requests (for reviewers) */
  findPendingSecurityChangeRequests(): Promise<any[]>;

  /** Review (approve/reject) a security change request */
  reviewSecurityChangeRequest(
    requestId: string,
    reviewedBy: string,
    approve: boolean,
    reviewNote: string | null,
  ): Promise<any>;

  /** Save / clear FCM device token for push notifications */
  saveFcmToken(userId: string, fcmToken: string | null): Promise<void>;
}


