import { Injectable } from '@nestjs/common';
import type { BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';
import type { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import type {
  CreateManagedWalletDto,
  ManagedWalletResponseDto,
  SendManagedTransactionDto,
  UpdateRecommendedChainDto,
} from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

/**
 * GetManagedWalletsQuery — read-only queries for managed wallet data.
 *
 * Separates reads from writes following CQS principle.
 * Delegates to ManagedWalletsService.
 */
@Injectable()
export class GetManagedWalletsQuery {
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async listWallets(userId: string, role: string): Promise<ManagedWalletResponseDto[]> {
    return this.managedWalletsService.listWallets(userId, role as never);
  }

  async getDepositDefaults(): Promise<{
    recommended_chain: BlockchainChainDbValue;
    defaults: ManagedWalletResponseDto[];
  }> {
    return this.managedWalletsService.getDepositDefaults();
  }

  async getWalletDetail(
    userId: string,
    walletId: string,
    role: string,
  ): Promise<ManagedWalletResponseDto & { balance: string; symbol: string }> {
    return this.managedWalletsService.getWalletDetail(userId, walletId, role as never);
  }

  async getWalletTransactions(
    userId: string,
    walletId: string,
    role: string,
    limit: number = 50,
  ): Promise<OnchainTransaction[]> {
    return this.managedWalletsService.getWalletTransactions(userId, walletId, role as never, limit);
  }

  async getDepositMethods(): Promise<{
    recommended_chain: string;
    methods: Array<{
      chain: string;
      label: string;
      deposit_address: string;
      is_recommended: boolean;
      deposit_enabled: boolean;
      min_confirmations: number;
      estimated_time: string;
    }>;
  }> {
    return this.managedWalletsService.getDepositMethods();
  }
}
