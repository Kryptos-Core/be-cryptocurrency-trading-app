import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import type { CreateManagedWalletDto, ManagedWalletResponseDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

export class CreateManagedWalletCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: CreateManagedWalletDto,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

/**
 * CreateManagedWalletUseCase — creates a new managed wallet.
 *
 * Note: The underlying service always throws ForbiddenException.
 * This use-case exists for Clean Architecture compliance.
 */
@Injectable()
export class CreateManagedWalletUseCase
  implements ICommandHandler<CreateManagedWalletCommand, ManagedWalletResponseDto>
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(command: CreateManagedWalletCommand): Promise<ManagedWalletResponseDto> {
    return this.managedWalletsService.createWallet(command.userId, command.dto);
  }
}
