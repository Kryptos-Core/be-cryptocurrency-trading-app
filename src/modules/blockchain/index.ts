export * from './application/queries';
export * from './application/use-cases';
export { BlockchainProviderFactory } from './blockchain-provider.factory';
export type {
  BlockchainLinkedWalletRecord,
  BlockchainOnchainTransactionRecord,
  BlockchainOnchainTransactionWriteInput,
} from './contracts';
export type {
  AdminWithdrawalDetailDto,
  AdminWithdrawalFilters,
  AdminWithdrawalRowDto,
  LinkedWalletRepositoryPort,
  OnchainTransactionRepositoryPort,
  OnchainTxRowDto,
} from './domain/ports';
export { LINKED_WALLET_REPOSITORY, ONCHAIN_TRANSACTION_REPOSITORY } from './domain/ports';
export * from './dto';

// Public persistence contracts for TypeORM registration and cross-module read-model references.
export { DepositMatchRequest } from './entities/deposit-match-request.entity';
export { LinkedWallet } from './entities/linked-wallet.entity';
export { OnchainTransaction } from './entities/onchain-transaction.entity';
