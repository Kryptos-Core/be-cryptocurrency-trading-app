import { Injectable } from '@nestjs/common';
import { TransactionWalletService } from '../../transaction-wallet.service';

@Injectable()
export class DeleteTransactionWalletUseCase {
  constructor(private readonly service: TransactionWalletService) {}

  async execute(walletId: string, actorUserId: string): Promise<void> {
    return this.service.deleteWallet(walletId, actorUserId);
  }
}
