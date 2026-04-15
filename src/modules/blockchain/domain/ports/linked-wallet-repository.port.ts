import type { LinkedWallet } from '@/entities/linked-wallet.entity';

/**
 * Port: Linked Wallet Repository
 * Domain-level abstraction for linked-wallet persistence.
 *
 * Sprint 3: Extract embedded SQL from wallet-linking.service.ts
 * into concrete implementation under infrastructure/persistence/.
 */
export interface LinkedWalletRepositoryPort {
  findByUserAndChain(userId: string, chain: string): Promise<LinkedWallet | null>;

  findByAddress(chain: string, address: string): Promise<LinkedWallet | null>;

  findByUser(userId: string): Promise<LinkedWallet[]>;

  create(data: Partial<LinkedWallet>): Promise<LinkedWallet>;

  updateStatus(linkedWalletId: string, status: string): Promise<void>;
}

export const LINKED_WALLET_REPOSITORY = Symbol('LINKED_WALLET_REPOSITORY');
