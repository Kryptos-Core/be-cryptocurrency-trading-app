import type { DeepPartial } from 'typeorm';
import type {
  TreasuryMainWallet,
  TreasuryMainWalletChain,
} from '@/entities/treasury-main-wallet.entity';

/**
 * Port: Treasury main wallet repository abstraction.
 * Domain/application depends on this interface; infrastructure provides the implementation.
 */
export interface TreasuryMainWalletRepositoryPort {
  countAll(): Promise<number>;
  findByChainForList(chain: TreasuryMainWalletChain): Promise<TreasuryMainWallet[]>;
  findPendingApprovalList(): Promise<TreasuryMainWallet[]>;
  findByMainWalletId(mainWalletId: string): Promise<TreasuryMainWallet | null>;
  findByChainAndAddress(
    chain: TreasuryMainWalletChain,
    address: string,
  ): Promise<TreasuryMainWallet | null>;
  findActiveDefaultOnChain(chain: TreasuryMainWalletChain): Promise<TreasuryMainWallet | null>;
  saveWallet(wallet: DeepPartial<TreasuryMainWallet>): Promise<TreasuryMainWallet>;
  saveNew(partial: DeepPartial<TreasuryMainWallet>): Promise<TreasuryMainWallet>;
  clearDefaultAndSetMainWallet(chain: TreasuryMainWalletChain, mainWalletId: string): Promise<void>;
  updateLabel(mainWalletId: string, label: string | null): Promise<void>;
  countActiveOthersOnChainExcluding(
    chain: TreasuryMainWalletChain,
    excludeMainWalletId: string,
  ): Promise<number>;
  deleteByMainWalletId(mainWalletId: string): Promise<void>;
  updateLastRotatedAt(mainWalletId: string, at: Date): Promise<void>;
  findAllActiveDefaults(): Promise<TreasuryMainWallet[]>;
}
