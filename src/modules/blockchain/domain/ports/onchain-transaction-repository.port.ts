import type { TransactionContext } from '@/common/types/transaction-context';
import type { BlockchainOnchainTransactionRecord } from '@/modules/blockchain/contracts';

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
  asset?: string;
}

export interface AdminWithdrawalRowDto extends OnchainTxRowDto {
  userId: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

export interface AdminWithdrawalDetailDto extends AdminWithdrawalRowDto {
  linkedWalletId: string | null;
  userWalletBalance: string | null;
}

export interface AdminUnmatchedDepositRowDto extends OnchainTxRowDto {
  userId: string | null;
  pendingMatchId: string | null;
  pendingMatchRequestedUserId: string | null;
}

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

export interface AdminUnmatchedDepositFilters {
  chain?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface OnchainTransactionRepositoryPort {
  findByChainAndTxHash(
    chain: string,
    txHash: string,
    logIndex?: number,
  ): Promise<BlockchainOnchainTransactionRecord | null>;

  findByIdAndUserId(
    txId: string,
    userId: string,
  ): Promise<BlockchainOnchainTransactionRecord | null>;

  findByUserPaginated(
    userId: string,
    filters: { type?: string; chain?: string; status?: string },
    limit: number,
    offset: number,
  ): Promise<{ items: BlockchainOnchainTransactionRecord[]; total: number }>;

  create(
    data: Partial<BlockchainOnchainTransactionRecord>,
  ): Promise<BlockchainOnchainTransactionRecord>;

  createWithinTransaction(
    ctx: TransactionContext,
    data: Partial<BlockchainOnchainTransactionRecord>,
  ): Promise<BlockchainOnchainTransactionRecord>;

  updateStatus(txId: string, status: string, extra?: Record<string, unknown>): Promise<void>;

  updateStatusWithinTransaction(
    ctx: TransactionContext,
    txId: string,
    status: string,
    extra?: Record<string, unknown>,
  ): Promise<void>;

  updateWithTxHash(txId: string, txHash: string, status: string): Promise<void>;

  findPendingWithdrawals(limit: number): Promise<BlockchainOnchainTransactionRecord[]>;

  updateCreditInfo(txId: string, creditTxId: string, creditedAt: Date): Promise<void>;

  findById(txId: string): Promise<BlockchainOnchainTransactionRecord | null>;

  updateCreditConversion(
    txId: string,
    creditCurrencyId: string,
    creditAmount: string,
    conversionRate: string,
  ): Promise<void>;

  updateCreditConversionWithinTransaction(
    ctx: TransactionContext,
    txId: string,
    creditCurrencyId: string,
    creditAmount: string,
    conversionRate: string,
  ): Promise<void>;

  updateAfterManualApproval(
    txId: string,
    txHash: string | null,
    fromAddress: string,
    status: string,
    confirmedAt: Date | null,
  ): Promise<void>;

  findPendingManualWithdrawals(limit: number): Promise<BlockchainOnchainTransactionRecord[]>;

  findConfirmingWithdrawals(limit: number): Promise<BlockchainOnchainTransactionRecord[]>;

  markOrphanConfirmingAsFailed(): Promise<number>;

  setMatchedUser(
    ctx: TransactionContext,
    txId: string,
    userId: string,
    status: string,
  ): Promise<void>;

  listByUser(userId: string, limit: number): Promise<OnchainTxRowDto[]>;

  getByIdAndUser(userId: string, txId: string): Promise<OnchainTxRowDto | null>;

  listAdminWithdrawals(
    filters: AdminWithdrawalFilters,
  ): Promise<{ data: AdminWithdrawalRowDto[]; total: number; page: number; limit: number }>;

  getAdminWithdrawalDetail(txId: string): Promise<AdminWithdrawalDetailDto | null>;

  getWithdrawalStats(): Promise<{
    pendingCount: number;
    pendingTotalByChain: Record<string, string>;
  }>;

  listAdminUnmatchedDeposits(
    filters: AdminUnmatchedDepositFilters,
  ): Promise<{ data: AdminUnmatchedDepositRowDto[]; total: number; page: number; limit: number }>;

  /** Dat high-risk flag tren mot giao dich (fraud detection). */
  setHighRiskFlag(txId: string, flag: string): Promise<void>;
}

export const ONCHAIN_TRANSACTION_REPOSITORY = Symbol('ONCHAIN_TRANSACTION_REPOSITORY');
