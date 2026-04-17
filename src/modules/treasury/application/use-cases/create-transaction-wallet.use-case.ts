import { Injectable } from '@nestjs/common';
import type { TransactionWalletRecord } from '@/modules/treasury';
import type { CreateTransactionWalletDto } from '../../dto';
import { TransactionWalletService } from '../../transaction-wallet.service';

@Injectable()
export class CreateTransactionWalletUseCase {
  constructor(private readonly service: TransactionWalletService) {}

  async execute(dto: CreateTransactionWalletDto): Promise<TransactionWalletRecord> {
    return this.service.createWallet(dto);
  }
}



