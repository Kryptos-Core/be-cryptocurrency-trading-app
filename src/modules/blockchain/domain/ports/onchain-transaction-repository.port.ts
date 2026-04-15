import type { OnchainTransaction } from '@/entities/onchain-transaction.entity';

/** DTO dùng trong read-model của user (getTransactions, getTransactionById) */
export interface OnchainTxRowDto {
  txId: string;
  chain: string;
  type: string;
  txHash: string | null;
  fromAddress: string;
  toAddress: string;
  amount: string;
  status: string;
  confirmations: number;
  createdAt: string;
  confirmedAt: string | null;
  creditedAmount: string | null;
  creditedCurrencyId: string | null;
  conversionRate: string | null;
}

/** DTO dùng trong admin read-model (getAdminWithdrawals) */
export interface AdminWithdrawalRowDto extends OnchainTxRowDto {
  userId: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

/** DTO admin single withdrawal detail (getAdminWithdrawalById) */
export interface AdminWithdrawalDetailDto extends AdminWithdrawalRowDto {
  linkedWalletId: string | null;
  userWalletBalance: string | null;
}

/** Bộ lọc cho admin withdrawal list */
export interface AdminWithdrawalFilters {
  userId?: string;
  status?: string;
  chain?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

/**
 * Port: Onchain Transaction Repository
 * Domain-level abstraction for on-chain transaction persistence.
 */
export interface OnchainTransactionRepositoryPort {
  findByChainAndTxHash(chain: string, txHash: string): Promise<OnchainTransaction | null>;

  findByIdAndUserId(txId: string, userId: string): Promise<OnchainTransaction | null>;

  findByUserPaginated(
    userId: string,
    filters: { type?: string; chain?: string; status?: string },
    limit: number,
    offset: number,
  ): Promise<{ items: OnchainTransaction[]; total: number }>;

  create(data: Partial<OnchainTransaction>): Promise<OnchainTransaction>;

  updateStatus(txId: string, status: string, extra?: Record<string, any>): Promise<void>;

  updateWithTxHash(txId: string, txHash: string, status: string): Promise<void>;

  findPendingWithdrawals(limit: number): Promise<OnchainTransaction[]>;

  /** Cập nhật thông tin credit sau khi ví được nạp thành công. */
  updateCreditInfo(txId: string, creditTxId: string, creditedAt: Date): Promise<void>;

  // ─── Read-model queries (cho OnchainTransferQueryService) ─────────────

  /** Lấy lịch sử giao dịch on-chain của user (read-model, không có pagination đầy đủ) */
  listByUser(userId: string, limit: number): Promise<OnchainTxRowDto[]>;

  /** Lấy chi tiết 1 giao dịch theo txId + userId */
  getByIdAndUser(userId: string, txId: string): Promise<OnchainTxRowDto | null>;

  /** Danh sách withdrawal cho admin (có join user, filter) */
  listAdminWithdrawals(
    filters: AdminWithdrawalFilters,
  ): Promise<{ data: AdminWithdrawalRowDto[]; total: number; page: number; limit: number }>;

  /** Chi tiết 1 withdrawal cho admin (có join user, có wallet balance) */
  getAdminWithdrawalDetail(txId: string): Promise<AdminWithdrawalDetailDto | null>;

  /** Thống kê pending withdrawal theo chain */
  getWithdrawalStats(): Promise<{
    pendingCount: number;
    pendingTotalByChain: Record<string, string>;
  }>;
}

export const ONCHAIN_TRANSACTION_REPOSITORY = Symbol('ONCHAIN_TRANSACTION_REPOSITORY');
