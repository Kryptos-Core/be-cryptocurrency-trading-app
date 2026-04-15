import type { DeepPartial, FindOptionsWhere } from 'typeorm';
import type { BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';
import type { TransactionWallet } from '@/entities/transaction-wallet.entity';

/**
 * Port: Treasury transaction wallet repository abstraction.
 */
export interface TreasuryTransactionWalletRepositoryPort {
  createAndSave(partial: DeepPartial<TransactionWallet>): Promise<TransactionWallet>;
  save(wallet: TransactionWallet): Promise<TransactionWallet>;
  findByWalletId(walletId: string): Promise<TransactionWallet | null>;
  findManyOrdered(where: FindOptionsWhere<TransactionWallet>): Promise<TransactionWallet[]>;
  findForDepositConfiguration(): Promise<TransactionWallet[]>;
  findDefaultUserDepositWallet(chain: BlockchainChainDbValue): Promise<TransactionWallet | null>;
  setDefaultUserDepositInTransaction(wallet: TransactionWallet): Promise<TransactionWallet>;
  findActiveWithdrawalCandidates(chain: BlockchainChainDbValue): Promise<TransactionWallet[]>;
  deleteByWalletId(walletId: string): Promise<void>;
}
