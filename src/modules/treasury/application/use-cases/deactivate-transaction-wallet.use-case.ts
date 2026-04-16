import { Injectable } from '@nestjs/common';
import type { TransactionWalletService } from '../../transaction-wallet.service';

@Injectable()
export class DeactivateTransactionWalletUseCase {
  constructor(private readonly service: TransactionWalletService) {}

  async execute(walletId: string): Promise<void> {
    return this.service.deactivateWallet(walletId);
  }
}
