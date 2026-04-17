import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import { UserRole } from '@/common/enums';
import type { ManagedWalletResponseDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

export class SetDepositDefaultCommand extends BaseCommand {
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
 * SetDepositDefaultUseCase — sets a transaction wallet as the default user deposit address.
 *
 * Thin adapter that delegates to ManagedWalletsService.setDepositDefault.
 */
@Injectable()
export class SetDepositDefaultUseCase
  implements ICommandHandler<SetDepositDefaultCommand, ManagedWalletResponseDto>
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(command: SetDepositDefaultCommand): Promise<ManagedWalletResponseDto> {
    return this.managedWalletsService.setDepositDefault(
      command.userId,
      command.walletId,
      command.role,
    );
  }
}
