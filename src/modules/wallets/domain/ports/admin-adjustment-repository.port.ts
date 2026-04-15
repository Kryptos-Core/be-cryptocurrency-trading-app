import type { TransactionContext } from '@/common/types/transaction-context';
import type { AdminAdjustWalletResponseDto } from '@/modules/wallets/dto/admin-adjust-wallet.dto';

export interface CreateAdjustmentParams {
  adjustmentId: string;
  actorUserId: string;
  targetUserId: string;
  currencyId: string;
  amount: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  note?: string;
}

/**
 * Port: Admin Wallet Adjustment Repository
 * Domain-level abstraction for admin adjustment audit persistence.
 */
export interface AdminAdjustmentRepositoryPort {
  createAdjustment(
    params: CreateAdjustmentParams,
    ctx?: TransactionContext,
  ): Promise<AdminAdjustWalletResponseDto>;

  findByTarget(
    targetUserId: string,
    limit: number,
    offset: number,
  ): Promise<AdminAdjustWalletResponseDto[]>;
}

export const ADMIN_ADJUSTMENT_REPOSITORY = Symbol('ADMIN_ADJUSTMENT_REPOSITORY');
