import type { QueryDeepPartialEntity } from 'typeorm';
import type { TreasuryMainWalletChain } from '@/entities/treasury-main-wallet.entity';
import type { TreasuryOperation } from '@/entities/treasury-operation.entity';
import type { ListTreasuryOperationsDto } from '../../dto';

/**
 * Port: Treasury operation repository abstraction.
 */
export interface TreasuryOperationRepositoryPort {
  createPendingOperation(params: {
    type: 'SWEEP' | 'FUND';
    chain: TreasuryMainWalletChain;
    fromWalletId: string | null;
    toWalletId: string | null;
    amount: string;
    actorUserId: string;
  }): Promise<TreasuryOperation>;

  findByOperationIdWithWallets(operationId: string): Promise<TreasuryOperation | null>;
  findByOperationId(operationId: string): Promise<TreasuryOperation | null>;
  countNonTerminalForWallet(walletId: string): Promise<number>;
  updateByOperationId(
    operationId: string,
    partial: QueryDeepPartialEntity<TreasuryOperation>,
  ): Promise<void>;

  listWithFilters(filter: ListTreasuryOperationsDto): Promise<{
    items: TreasuryOperation[];
    total: number;
    page: number;
    limit: number;
  }>;

  finalizeSuccessWithOnchainTx(params: {
    operation: TreasuryOperation;
    fromAddress: string;
    toAddress: string;
    txHash: string;
    amount: string;
  }): Promise<void>;
}
