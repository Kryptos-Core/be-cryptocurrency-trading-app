import { Injectable } from '@nestjs/common';
import type { TransactionWallet } from '@/entities/transaction-wallet.entity';
import type { TransactionWalletService } from '../../transaction-wallet.service';

@Injectable()
export class UnsetDefaultUserDepositUseCase {
  constructor(private readonly service: TransactionWalletService) {}

  async execute(walletId: string): Promise<TransactionWallet> {
    return this.service.unsetDefaultUserDeposit(walletId);
  }
}
