import { Injectable } from '@nestjs/common';
import { WalletLinkingService } from '../../wallet-linking.service';

@Injectable()
export class UnlinkWalletUseCase {
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(userId: string, linkId: string): Promise<{ linkId: string; status: string }> {
    return this.walletLinkingService.unlinkWallet(userId, linkId);
  }
}
