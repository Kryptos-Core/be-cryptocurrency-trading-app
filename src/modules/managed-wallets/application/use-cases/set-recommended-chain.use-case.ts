import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import type { UpdateRecommendedChainDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

export class SetRecommendedChainCommand extends BaseCommand {
  constructor(
    public readonly dto: UpdateRecommendedChainDto,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

/**
 * SetRecommendedChainUseCase — sets the recommended deposit chain shown to users.
 *
 * Thin adapter that delegates to ManagedWalletsService.setRecommendedChain.
 */
@Injectable()
export class SetRecommendedChainUseCase
  implements
    ICommandHandler<
      SetRecommendedChainCommand,
      Awaited<ReturnType<ManagedWalletsService['setRecommendedChain']>>
    >
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(command: SetRecommendedChainCommand) {
    return this.managedWalletsService.setRecommendedChain(command.dto);
  }
}
