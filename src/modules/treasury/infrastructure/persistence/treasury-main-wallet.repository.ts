import { Injectable } from '@nestjs/common';
import { DataSource, type DeepPartial, In, Not } from 'typeorm';
import {
  TreasuryMainWallet,
  type TreasuryMainWalletChain,
} from '@/entities/treasury-main-wallet.entity';
import type { TreasuryMainWalletRepositoryPort } from '../../domain/ports';

/**
 * Persistence for treasury main wallets - keeps TypeORM usage out of TreasuryMainWalletService.
 * Implements TreasuryMainWalletRepositoryPort for DIP compliance.
 */
@Injectable()
export class TreasuryMainWalletRepository implements TreasuryMainWalletRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  private repo() {
    return this.dataSource.getRepository(TreasuryMainWallet);
  }

  async countAll(): Promise<number> {
    return this.repo().count();
  }

  async findByChainForList(chain: TreasuryMainWalletChain): Promise<TreasuryMainWallet[]> {
    return this.repo().find({
      where: { chain, status: In(['ACTIVE', 'PENDING_DELETION']) },
      order: { is_default: 'DESC', created_at: 'ASC' },
    });
  }

  async findPendingApprovalList(): Promise<TreasuryMainWallet[]> {
    return this.repo().find({
      where: { status: In(['PENDING_APPROVAL', 'PENDING_DELETION']) },
      order: { created_at: 'ASC' },
    });
  }

  async findByMainWalletId(mainWalletId: string): Promise<TreasuryMainWallet | null> {
    return this.repo().findOne({ where: { main_wallet_id: mainWalletId } });
  }

  async findByChainAndAddress(
    chain: TreasuryMainWalletChain,
    address: string,
  ): Promise<TreasuryMainWallet | null> {
    return this.repo().findOne({ where: { chain, address } });
  }

  async findActiveDefaultOnChain(
    chain: TreasuryMainWalletChain,
  ): Promise<TreasuryMainWallet | null> {
    return this.repo().findOne({
      where: { chain, is_default: true, status: 'ACTIVE' },
    });
  }

  async saveWallet(wallet: DeepPartial<TreasuryMainWallet>): Promise<TreasuryMainWallet> {
    return this.repo().save(wallet as TreasuryMainWallet);
  }

  async saveNew(partial: DeepPartial<TreasuryMainWallet>): Promise<TreasuryMainWallet> {
    const entity = this.repo().create(partial);
    return this.repo().save(entity);
  }

  async clearDefaultAndSetMainWallet(
    chain: TreasuryMainWalletChain,
    mainWalletId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(TreasuryMainWallet, { chain, is_default: true }, { is_default: false });
      await manager.update(
        TreasuryMainWallet,
        { main_wallet_id: mainWalletId },
        { is_default: true },
      );
    });
  }

  async updateLabel(mainWalletId: string, label: string | null): Promise<void> {
    await this.repo().update({ main_wallet_id: mainWalletId }, { label });
  }

  async countActiveOthersOnChainExcluding(
    chain: TreasuryMainWalletChain,
    excludeMainWalletId: string,
  ): Promise<number> {
    return this.repo().count({
      where: { chain, main_wallet_id: Not(excludeMainWalletId), status: 'ACTIVE' },
    });
  }

  async deleteByMainWalletId(mainWalletId: string): Promise<void> {
    await this.repo().delete({ main_wallet_id: mainWalletId });
  }

  async updateLastRotatedAt(mainWalletId: string, at: Date): Promise<void> {
    await this.repo().update({ main_wallet_id: mainWalletId }, { last_rotated_at: at });
  }

  async findAllActiveDefaults(): Promise<TreasuryMainWallet[]> {
    return this.repo().find({
      where: { is_default: true, status: 'ACTIVE' },
    });
  }
}
