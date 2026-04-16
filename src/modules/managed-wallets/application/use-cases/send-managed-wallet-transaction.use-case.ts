import { Injectable } from '@nestjs/common';
import { UserRole } from '@/common/enums';
import type { SendManagedTransactionDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

/**
 * SendManagedWalletTransactionUseCase — sends TRX from a managed wallet.
 *
 * Thin adapter that delegates to ManagedWalletsService.sendTransaction.
 */
@Injectable()
export class SendManagedWalletTransactionUseCase {
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(walletId: string, userId: string, role: UserRole, dto: SendManagedTransactionDto) {
    return this.managedWalletsService.sendTransaction(userId, walletId, role, dto);
  }
}
