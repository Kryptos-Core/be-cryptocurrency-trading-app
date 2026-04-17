import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import type { RequestLinkDto } from '../../dto';
import { WalletLinkingService } from '../services/wallet-linking/wallet-linking.service';

export class RequestLinkWalletCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: RequestLinkDto,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class RequestLinkWalletUseCase
  implements ICommandHandler<RequestLinkWalletCommand, { message: string; expiresIn: number }>
{
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(command: RequestLinkWalletCommand): Promise<{ message: string; expiresIn: number }> {
    return this.walletLinkingService.requestLink(command.userId, command.dto);
  }
}
