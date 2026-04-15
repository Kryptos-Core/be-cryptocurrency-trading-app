import { Injectable } from '@nestjs/common';
import type { RequestLinkDto } from '../../dto';
import { WalletLinkingService } from '../../wallet-linking.service';

@Injectable()
export class RequestLinkWalletUseCase {
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(
    userId: string,
    dto: RequestLinkDto,
  ): Promise<{ message: string; expiresIn: number }> {
    return this.walletLinkingService.requestLink(userId, dto);
  }
}
