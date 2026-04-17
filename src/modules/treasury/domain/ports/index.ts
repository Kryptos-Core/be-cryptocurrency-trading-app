export type { TreasuryMainWalletRepositoryPort } from './treasury-main-wallet-repository.port';
export type { TreasuryOnchainReadRepositoryPort } from './treasury-onchain-read-repository.port';
export type { TreasuryOperationRepositoryPort } from './treasury-operation-repository.port';
export type { TreasuryTransactionWalletRepositoryPort } from './treasury-transaction-wallet-repository.port';

/** Injection tokens */
export const TREASURY_MAIN_WALLET_REPOSITORY = Symbol('TREASURY_MAIN_WALLET_REPOSITORY');
export const TREASURY_OPERATION_REPOSITORY = Symbol('TREASURY_OPERATION_REPOSITORY');
export const TREASURY_TRANSACTION_WALLET_REPOSITORY = Symbol(
  'TREASURY_TRANSACTION_WALLET_REPOSITORY',
);
export const TREASURY_ONCHAIN_READ_REPOSITORY = Symbol('TREASURY_ONCHAIN_READ_REPOSITORY');
