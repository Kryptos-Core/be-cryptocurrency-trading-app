/**
 * Re-export the existing IBlockchainProvider port.
 * The interface already lives at ../interfaces/blockchain.interface.ts — this
 * barrel makes it discoverable from the canonical domain/ports path.
 */
export type {
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
  IBlockchainProvider,
} from '@/modules/blockchain/interfaces/blockchain.interface';

export {
  DEPOSIT_MATCH_REQUEST_REPOSITORY,
  type DepositMatchRequestRepositoryPort,
} from './deposit-match-request-repository.port';

export {
  LINKED_WALLET_REPOSITORY,
  type LinkedWalletRepositoryPort,
} from './linked-wallet-repository.port';
export {
  type AdminUnmatchedDepositFilters,
  type AdminUnmatchedDepositRowDto,
  type AdminWithdrawalDetailDto,
  type AdminWithdrawalFilters,
  type AdminWithdrawalRowDto,
  ONCHAIN_TRANSACTION_REPOSITORY,
  type OnchainTransactionRepositoryPort,
  type OnchainTxRowDto,
} from './onchain-transaction-repository.port';
