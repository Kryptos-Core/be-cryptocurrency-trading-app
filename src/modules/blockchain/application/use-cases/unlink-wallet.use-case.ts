import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import { WalletLinkingService } from '../../wallet-linking.service';

export class UnlinkWalletCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly linkId: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class UnlinkWalletUseCase
  implements ICommandHandler<UnlinkWalletCommand, { linkId: string; status: string }>
{
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(command: UnlinkWalletCommand): Promise<{ linkId: string; status: string }> {
    return this.walletLinkingService.unlinkWallet(command.userId, command.linkId);
  }
}
