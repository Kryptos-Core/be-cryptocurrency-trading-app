import { Injectable } from '@nestjs/common';
import type { TransactionWallet } from '@/entities/transaction-wallet.entity';
import type { CreateTransactionWalletDto } from '../../dto';
import type { TransactionWalletService } from '../../transaction-wallet.service';

@Injectable()
export class CreateTransactionWalletUseCase {
  constructor(private readonly service: TransactionWalletService) {}

  async execute(dto: CreateTransactionWalletDto): Promise<TransactionWallet> {
    return this.service.createWallet(dto);
  }
}
