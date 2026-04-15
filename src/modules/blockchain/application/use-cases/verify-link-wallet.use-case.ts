import { Injectable } from '@nestjs/common';
import type { VerifyLinkDto } from '../../dto';
import { WalletLinkingService } from '../../wallet-linking.service';

@Injectable()
export class VerifyLinkWalletUseCase {
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(
    userId: string,
    dto: VerifyLinkDto,
  ): Promise<{ linkId: string; chain: string; address: string; status: string }> {
    return this.walletLinkingService.verifyLink(userId, dto);
  }
}
