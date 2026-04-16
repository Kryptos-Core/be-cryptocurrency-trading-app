import { Injectable } from '@nestjs/common';
import type { TransactionWallet } from '@/entities/transaction-wallet.entity';
import { TransactionWalletService } from '../../transaction-wallet.service';

@Injectable()
export class SendWithdrawalUseCase {
  constructor(private readonly service: TransactionWalletService) {}

  async execute(wallet: TransactionWallet, toAddress: string, amount: string): Promise<string> {
    return this.service.sendWithdrawalNativeTransfer(wallet, toAddress, amount);
  }
}
