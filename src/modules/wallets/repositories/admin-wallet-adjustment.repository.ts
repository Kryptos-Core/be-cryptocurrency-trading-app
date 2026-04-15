/**
 * @deprecated Import from infrastructure/persistence instead.
 * Kept for backward compatibility — external modules still import AdminWalletAdjustmentRepository from here.
 */
export { AdminWalletAdjustmentRepositoryImpl as AdminWalletAdjustmentRepository } from '../infrastructure/persistence/admin-wallet-adjustment.repository.impl';

// Re-export the CreateAdjustmentParams type from the domain port (old consumers imported it from here)
export type { CreateAdjustmentParams } from '../domain/ports/admin-adjustment-repository.port';
