export {
  ONCHAIN_TRANSACTION_REPOSITORY,
  type OnchainTransactionRepositoryPort,
} from './onchain-transaction-repository.port';

export {
  LINKED_WALLET_REPOSITORY,
  type LinkedWalletRepositoryPort,
} from './linked-wallet-repository.port';

/**
 * Re-export the existing IBlockchainProvider port.
 * The interface already lives at ../interfaces/blockchain.interface.ts — this
 * barrel makes it discoverable from the canonical domain/ports path.
 */
export type {
  IBlockchainProvider,
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
} from '@/modules/blockchain/interfaces/blockchain.interface';
