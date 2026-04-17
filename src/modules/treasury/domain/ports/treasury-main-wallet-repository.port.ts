import type { DeepPartial } from 'typeorm';
import type {
  TreasuryMainWalletChain,
  TreasuryMainWalletRecord,
} from '@/modules/treasury/contracts';

/**
 * Port: Treasury main wallet repository abstraction.
 * Domain/application depends on this interface; infrastructure provides the implementation.
 */
export interface TreasuryMainWalletRepositoryPort {
  countAll(): Promise<number>;
  findByChainForList(chain: TreasuryMainWalletChain): Promise<TreasuryMainWalletRecord[]>;
  findPendingApprovalList(): Promise<TreasuryMainWalletRecord[]>;
  findByMainWalletId(mainWalletId: string): Promise<TreasuryMainWalletRecord | null>;
  findByChainAndAddress(
    chain: TreasuryMainWalletChain,
    address: string,
  ): Promise<TreasuryMainWalletRecord | null>;
  findActiveDefaultOnChain(chain: TreasuryMainWalletChain): Promise<TreasuryMainWalletRecord | null>;
  saveWallet(wallet: DeepPartial<TreasuryMainWalletRecord>): Promise<TreasuryMainWalletRecord>;
  saveNew(partial: DeepPartial<TreasuryMainWalletRecord>): Promise<TreasuryMainWalletRecord>;
  clearDefaultAndSetMainWallet(chain: TreasuryMainWalletChain, mainWalletId: string): Promise<void>;
  updateLabel(mainWalletId: string, label: string | null): Promise<void>;
  countActiveOthersOnChainExcluding(
    chain: TreasuryMainWalletChain,
    excludeMainWalletId: string,
  ): Promise<number>;
  deleteByMainWalletId(mainWalletId: string): Promise<void>;
  updateLastRotatedAt(mainWalletId: string, at: Date): Promise<void>;
  findAllActiveDefaults(): Promise<TreasuryMainWalletRecord[]>;
}
