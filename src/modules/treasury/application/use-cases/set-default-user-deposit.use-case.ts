import { Injectable } from '@nestjs/common';
import type { TransactionWallet } from '@/entities/transaction-wallet.entity';
import { TransactionWalletService } from '../../transaction-wallet.service';

@Injectable()
export class SetDefaultUserDepositUseCase {
  constructor(private readonly service: TransactionWalletService) {}

  async execute(walletId: string): Promise<TransactionWallet> {
    return this.service.setDefaultUserDeposit(walletId);
  }
}
