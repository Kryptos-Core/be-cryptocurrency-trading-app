import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import { WalletLinkingService } from '../services/wallet-linking/wallet-linking.service';

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
  implements ICommandHandler<UnlinkWalletCommand, { success: boolean; linkId: string }>
{
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(command: UnlinkWalletCommand): Promise<{ success: boolean; linkId: string }> {
    return this.walletLinkingService.unlinkWallet(command.userId, command.linkId);
  }
}
