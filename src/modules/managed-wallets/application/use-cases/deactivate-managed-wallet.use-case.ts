import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import { UserRole } from '@/common/enums';
import { ManagedWalletsService } from '../../managed-wallets.service';

export class DeactivateManagedWalletCommand extends BaseCommand {
  constructor(
    public readonly walletId: string,
    public readonly userId: string,
    public readonly role: UserRole,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

/**
 * DeactivateManagedWalletUseCase — deactivates a managed wallet.
 *
 * Thin adapter that delegates to ManagedWalletsService.deactivateWallet.
 */
@Injectable()
export class DeactivateManagedWalletUseCase
  implements ICommandHandler<DeactivateManagedWalletCommand, { success: true }>
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(command: DeactivateManagedWalletCommand): Promise<{ success: true }> {
    return this.managedWalletsService.deactivateWallet(
      command.userId,
      command.walletId,
      command.role,
    );
  }
}
