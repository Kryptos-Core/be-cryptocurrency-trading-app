import { Injectable } from '@nestjs/common';
import { WalletLinkingService } from '../../wallet-linking.service';

@Injectable()
export class GetLinkedWalletsQuery {
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(userId: string): Promise<
    Array<{
      linkId: string;
      chain: string;
      address: string;
      label: string | null;
      status: string;
      linkedAt: string | null;
    }>
  > {
    return this.walletLinkingService.getLinkedWallets(userId);
  }
}

@Injectable()
export class GetLinkedWalletBalanceQuery {
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(userId: string, linkId: string) {
    return this.walletLinkingService.getLinkedWalletBalance(userId, linkId);
  }
}
