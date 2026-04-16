import { Injectable } from '@nestjs/common';
import type { BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';
import type { TransactionWallet } from '@/entities/transaction-wallet.entity';
import type { ListTreasuryWalletsDto } from '../../dto';
import {
  TransactionWalletService,
  type TreasuryOnChainBalances,
  type TreasuryWalletWithBalance,
} from '../../transaction-wallet.service';

@Injectable()
export class GetTransactionWalletQuery {
  constructor(private readonly service: TransactionWalletService) {}

  async listWallets(filter: ListTreasuryWalletsDto): Promise<TreasuryWalletWithBalance[]> {
    return this.service.listWallets(filter);
  }

  async getBalanceCached(
    chain: BlockchainChainDbValue,
    address: string,
  ): Promise<TreasuryOnChainBalances> {
    return this.service.getBalanceCached(chain as any, address);
  }

  async getWalletById(walletId: string): Promise<TransactionWallet> {
    return this.service.getWalletById(walletId);
  }

  async getWalletDetail(
    walletId: string,
  ): Promise<TransactionWallet & { balance: string; symbol: string; usdtTrc20Balance?: string }> {
    return this.service.getWalletDetail(walletId);
  }

  async getBalanceByAddress(
    chain: BlockchainChainDbValue,
    address: string,
  ): Promise<TreasuryOnChainBalances> {
    return this.service.getBalanceByAddress(chain as any, address);
  }

  async getMainWalletAddress(chain: BlockchainChainDbValue): Promise<string> {
    return this.service.getMainWalletAddress(chain as any);
  }

  async resolveMainWalletPrivateKey(chain: BlockchainChainDbValue): Promise<string> {
    return this.service.resolveMainWalletPrivateKey(chain as any);
  }

  async listWalletsForDepositConfiguration(): Promise<TransactionWallet[]> {
    return this.service.listWalletsForDepositConfiguration();
  }

  async getDefaultUserDepositWallet(
    chain: BlockchainChainDbValue,
  ): Promise<TransactionWallet | null> {
    return this.service.getDefaultUserDepositWallet(chain as any);
  }

  async getWithdrawalSourceWallet(chain: string): Promise<TransactionWallet | null> {
    return this.service.getWithdrawalSourceWallet(chain);
  }

  async waitForTronBalanceReflectSweep(
    chain: 'TRON_MAINNET' | 'TRON_NILE' | 'TRON_SHASTA',
    address: string,
    reserveSun?: number,
  ): Promise<void> {
    return this.service.waitForTronBalanceReflectSweep(chain, address, reserveSun);
  }

  async waitForTronBalanceReflectFund(
    chain: 'TRON_MAINNET' | 'TRON_NILE' | 'TRON_SHASTA',
    address: string,
    balanceSunBeforeTx: number,
  ): Promise<void> {
    return this.service.waitForTronBalanceReflectFund(chain, address, balanceSunBeforeTx);
  }

  async getTronNativeBalanceSun(
    chain: 'TRON_MAINNET' | 'TRON_NILE' | 'TRON_SHASTA',
    address: string,
  ): Promise<number> {
    return this.service.getTronNativeBalanceSun(chain, address);
  }
}
