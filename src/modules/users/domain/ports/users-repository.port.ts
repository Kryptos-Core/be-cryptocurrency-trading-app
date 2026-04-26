import type { UserRole } from '@/common/enums';
import type { BlockchainOnchainTransactionRecord } from '@/modules/blockchain';
import type { UserRecord } from '@/modules/users/contracts';
import type { UserFilterDto } from '@/modules/users/dto/user-filter.dto';

export type UserSecurityChangeHistoryItem = {
  request_id: string;
  change_type: string;
  status: string;
  requested_at: Date;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  review_note: string | null;
};

export type PendingSecurityChangeRequestRecord = {
  request_id: string;
  user_id: string;
  change_type: string;
  payload_json: string;
  requested_at: Date;
  user_email: string;
  first_name: string | null;
  last_name: string | null;
};

export type ReviewedSecurityChangeRequestRecord = {
  request_id: string;
  user_id: string;
  status: string;
};

/**
 * Users Repository Port — domain contract for user persistence.
 */
export interface UsersRepositoryPort {
  findById(userId: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findAll(page?: number, limit?: number): Promise<{ users: UserRecord[]; total: number }>;
  findAllWithFilters(
    filters: UserFilterDto,
  ): Promise<{ users: UserRecord[]; total: number; page: number; limit: number }>;
  findTestUsersByRole(role: UserRole, search?: string, limit?: number): Promise<UserRecord[]>;
  findSecurityChangesByUserId(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{ items: UserSecurityChangeHistoryItem[]; total: number }>;
  findOnchainTransactionsByUser(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<{ items: BlockchainOnchainTransactionRecord[]; total: number }>;
  createUser(
    email: string,
    passwordHash: string,
    firstName?: string | null,
    lastName?: string | null,
    role?: UserRole,
  ): Promise<UserRecord>;
  create(email: string, passwordHash: string): Promise<UserRecord>;
  update(
    userId: string,
    updates: { email?: string; status?: string; role?: UserRole; identityVerified?: boolean },
  ): Promise<void>;
  delete(userId: string): Promise<void>;
  getStatistics(): Promise<{ total: number; active: number; banned: number; pending: number }>;
  emailExists(email: string, excludeUserId?: string): Promise<boolean>;
  setEmailVerified(userId: string, verified: boolean): Promise<void>;
  updateProfileBasic(
    userId: string,
    firstName: string | null,
    lastName: string | null,
  ): Promise<number>;
  updateAvatar(
    userId: string,
    avatarUrl: string | null,
    avatarPublicId: string | null,
  ): Promise<number>;
  createSecurityChangeRequest(
    requestId: string,
    userId: string,
    changeType: string,
    payload: Record<string, unknown>,
  ): Promise<string>;
  findPendingSecurityChangeRequests(): Promise<PendingSecurityChangeRequestRecord[]>;
  reviewSecurityChangeRequest(
    requestId: string,
    reviewedBy: string,
    approve: boolean,
    reviewNote: string | null,
  ): Promise<ReviewedSecurityChangeRequestRecord | null>;
  saveFcmToken(userId: string, fcmToken: string | null): Promise<void>;
}
