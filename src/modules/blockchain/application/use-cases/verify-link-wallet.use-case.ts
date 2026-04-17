import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import type { VerifyLinkDto } from '../../dto';
import { WalletLinkingService } from '../../wallet-linking.service';

export class VerifyLinkWalletCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: VerifyLinkDto,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class VerifyLinkWalletUseCase
  implements
    ICommandHandler<
      VerifyLinkWalletCommand,
      { linkId: string; chain: string; address: string; status: string }
    >
{
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(
    command: VerifyLinkWalletCommand,
  ): Promise<{ linkId: string; chain: string; address: string; status: string }> {
    return this.walletLinkingService.verifyLink(command.userId, command.dto);
  }
}
