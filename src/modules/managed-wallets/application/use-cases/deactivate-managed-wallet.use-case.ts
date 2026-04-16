import { Injectable } from '@nestjs/common';
import { UserRole } from '@/common/enums';
import { ManagedWalletsService } from '../../managed-wallets.service';

/**
 * DeactivateManagedWalletUseCase — deactivates a managed wallet.
 *
 * Thin adapter that delegates to ManagedWalletsService.deactivateWallet.
 */
@Injectable()
export class DeactivateManagedWalletUseCase {
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(walletId: string, userId: string, role: UserRole): Promise<{ success: true }> {
    return this.managedWalletsService.deactivateWallet(userId, walletId, role);
  }
}
