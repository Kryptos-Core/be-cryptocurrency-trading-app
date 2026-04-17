import { Injectable } from '@nestjs/common';
import { DataSource, type DeepPartial, type FindOptionsWhere, In } from 'typeorm';
import type { BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';
import { NotFoundException } from '@/common/exceptions';
import { TransactionWallet } from '@/entities/transaction-wallet.entity';
import type { TreasuryTransactionWalletRepositoryPort } from '../../domain/ports';

export const TRON_DEPOSIT_UI_CHAINS = ['TRON_MAINNET', 'TRON_NILE', 'TRON_SHASTA'] as const;
export type TronDepositUiChain = (typeof TRON_DEPOSIT_UI_CHAINS)[number];

@Injectable()
export class TreasuryTransactionWalletRepository
  implements TreasuryTransactionWalletRepositoryPort
{
  constructor(private readonly dataSource: DataSource) {}

  async createAndSave(partial: DeepPartial<TransactionWallet>): Promise<TransactionWallet> {
    const repo = this.dataSource.getRepository(TransactionWallet);
    return repo.save(repo.create(partial));
  }

  async save(wallet: TransactionWallet): Promise<TransactionWallet> {
    return this.dataSource.getRepository(TransactionWallet).save(wallet);
  }

  async findByWalletId(walletId: string): Promise<TransactionWallet | null> {
    return this.dataSource.getRepository(TransactionWallet).findOne({
      where: { wallet_id: walletId },
    });
  }

  async findManyOrdered(where: FindOptionsWhere<TransactionWallet>): Promise<TransactionWallet[]> {
    return this.dataSource.getRepository(TransactionWallet).find({
      where,
      order: { created_at: 'DESC' },
    });
  }

  async findForDepositConfiguration(): Promise<TransactionWallet[]> {
    return this.dataSource.getRepository(TransactionWallet).find({
      where: {
        chain: In([...TRON_DEPOSIT_UI_CHAINS]),
        purpose: In(['DEPOSIT', 'BOTH']),
      },
      order: {
        is_default_user_deposit: 'DESC',
        default_set_at: 'DESC',
        created_at: 'DESC',
      },
    });
  }

  async findDefaultUserDepositWallet(
    chain: BlockchainChainDbValue,
  ): Promise<TransactionWallet | null> {
    return this.dataSource.getRepository(TransactionWallet).findOne({
      where: {
        chain,
        is_default_user_deposit: true,
        is_active: true,
        purpose: In(['DEPOSIT', 'BOTH']),
      },
      order: {
        default_set_at: 'DESC',
        created_at: 'DESC',
      },
    });
  }

  /**
   * Clears default flag for same chain, then marks `wallet` as default (caller validated business rules).
   */
  async setDefaultUserDepositInTransaction(wallet: TransactionWallet): Promise<TransactionWallet> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TransactionWallet);
      const fresh = await repo.findOne({ where: { wallet_id: wallet.wallet_id } });
      if (!fresh) {
        throw new NotFoundException('Transaction wallet', wallet.wallet_id);
      }

      await repo.update(
        {
          chain: fresh.chain,
          is_default_user_deposit: true,
        },
        {
          is_default_user_deposit: false,
          default_set_at: null,
        },
      );

      fresh.is_default_user_deposit = true;
      fresh.default_set_at = new Date();
      return repo.save(fresh);
    });
  }

  async findActiveWithdrawalCandidates(
    chain: BlockchainChainDbValue,
  ): Promise<TransactionWallet[]> {
    return this.dataSource.getRepository(TransactionWallet).find({
      where: {
        chain,
        is_active: true,
        purpose: In(['WITHDRAWAL', 'BOTH']),
      },
    });
  }

  async deleteByWalletId(walletId: string): Promise<void> {
    const res = await this.dataSource
      .getRepository(TransactionWallet)
      .delete({ wallet_id: walletId });
    if (!res.affected) {
      throw new NotFoundException('Transaction wallet', walletId);
    }
  }
}
