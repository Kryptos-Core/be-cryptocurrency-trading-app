/**
 * @deprecated Import from infrastructure/persistence instead.
 * Kept for backward compatibility — external modules still import WalletLedgerRepository from here.
 */
export { WalletLedgerRepositoryImpl as WalletLedgerRepository } from '../infrastructure/persistence/wallet-ledger.repository.impl';

// Re-export the LedgerEntryInput type from the domain port (old consumers imported it from here)
export type { LedgerEntryInput } from '../domain/ports/wallet-ledger-repository.port';
