import type { OnchainTransaction } from '@/entities/onchain-transaction.entity';

/**
 * Port: Onchain Transaction Repository
 * Domain-level abstraction for on-chain transaction persistence.
 *
 * Sprint 3: Extract embedded SQL from onchain-deposit.service.ts,
 * onchain-withdrawal.service.ts, and onchain-transfer-query.service.ts
 * into concrete implementations under infrastructure/persistence/.
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
}

export const ONCHAIN_TRANSACTION_REPOSITORY = Symbol('ONCHAIN_TRANSACTION_REPOSITORY');
