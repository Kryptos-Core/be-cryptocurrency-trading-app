import { Injectable } from '@nestjs/common';
import { UserRole } from '@/common/enums';
import type { ManagedWalletResponseDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

/**
 * SetDepositDefaultUseCase — sets a transaction wallet as the default user deposit address.
 *
 * Thin adapter that delegates to ManagedWalletsService.setDepositDefault.
 */
@Injectable()
export class SetDepositDefaultUseCase {
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(
    walletId: string,
    userId: string,
    role: UserRole,
  ): Promise<ManagedWalletResponseDto> {
    return this.managedWalletsService.setDepositDefault(userId, walletId, role);
  }
}
