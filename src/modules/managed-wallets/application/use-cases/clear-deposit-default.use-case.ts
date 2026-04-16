import { Injectable } from '@nestjs/common';
import { UserRole } from '@/common/enums';
import type { ManagedWalletResponseDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

/**
 * ClearDepositDefaultUseCase — clears this wallet as the default user deposit address for its chain.
 *
 * Thin adapter that delegates to ManagedWalletsService.clearDepositDefault.
 */
@Injectable()
export class ClearDepositDefaultUseCase {
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(
    walletId: string,
    userId: string,
    role: UserRole,
  ): Promise<ManagedWalletResponseDto> {
    return this.managedWalletsService.clearDepositDefault(userId, walletId, role);
  }
}
