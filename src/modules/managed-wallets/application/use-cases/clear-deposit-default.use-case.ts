import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import { UserRole } from '@/common/enums';
import type { ManagedWalletResponseDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

export class ClearDepositDefaultCommand extends BaseCommand {
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
 * ClearDepositDefaultUseCase — clears this wallet as the default user deposit address for its chain.
 *
 * Thin adapter that delegates to ManagedWalletsService.clearDepositDefault.
 */
@Injectable()
export class ClearDepositDefaultUseCase
  implements ICommandHandler<ClearDepositDefaultCommand, ManagedWalletResponseDto>
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(command: ClearDepositDefaultCommand): Promise<ManagedWalletResponseDto> {
    return this.managedWalletsService.clearDepositDefault(
      command.userId,
      command.walletId,
      command.role,
    );
  }
}
