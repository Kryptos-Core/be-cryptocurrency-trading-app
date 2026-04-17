export { LINKED_WALLET_REPOSITORY, ONCHAIN_TRANSACTION_REPOSITORY } from './domain/ports';
export type {
  AdminWithdrawalFilters,
  AdminWithdrawalDetailDto,
  AdminWithdrawalRowDto,
  LinkedWalletRepositoryPort,
  OnchainTransactionRepositoryPort,
  OnchainTxRowDto,
} from './domain/ports';
export * from './dto';
export * from './application/use-cases';
export * from './application/queries';
export { BlockchainProviderFactory } from './blockchain-provider.factory';

// Public persistence contracts for TypeORM registration and cross-module read-model references.
export { LinkedWallet } from './entities/linked-wallet.entity';
export { OnchainTransaction } from './entities/onchain-transaction.entity';
