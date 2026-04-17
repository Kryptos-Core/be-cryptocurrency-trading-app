import { Injectable } from '@nestjs/common';
import type { TransactionWalletRecord } from '@/modules/treasury';
import { TransactionWalletService } from '../../transaction-wallet.service';

@Injectable()
export class SetDefaultUserDepositUseCase {
  constructor(private readonly service: TransactionWalletService) {}

  async execute(walletId: string): Promise<TransactionWalletRecord> {
    return this.service.setDefaultUserDeposit(walletId);
  }
}
