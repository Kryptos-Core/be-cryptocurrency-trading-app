import type { DeepPartial, FindOptionsWhere } from 'typeorm';
import type { BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';
import type { TransactionWalletRecord } from '@/modules/treasury/contracts';

/**
 * Port: Treasury transaction wallet repository abstraction.
 */
export interface TreasuryTransactionWalletRepositoryPort {
  createAndSave(partial: DeepPartial<TransactionWalletRecord>): Promise<TransactionWalletRecord>;
  save(wallet: TransactionWalletRecord): Promise<TransactionWalletRecord>;
  findByWalletId(walletId: string): Promise<TransactionWalletRecord | null>;
  findManyOrdered(where: FindOptionsWhere<TransactionWalletRecord>): Promise<TransactionWalletRecord[]>;
  findForDepositConfiguration(): Promise<TransactionWalletRecord[]>;
  findDefaultUserDepositWallet(
    chain: BlockchainChainDbValue,
  ): Promise<TransactionWalletRecord | null>;
  setDefaultUserDepositInTransaction(wallet: TransactionWalletRecord): Promise<TransactionWalletRecord>;
  findActiveWithdrawalCandidates(chain: BlockchainChainDbValue): Promise<TransactionWalletRecord[]>;
  deleteByWalletId(walletId: string): Promise<void>;
}
