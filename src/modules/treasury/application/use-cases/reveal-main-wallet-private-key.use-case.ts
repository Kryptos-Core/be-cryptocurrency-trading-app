import { Injectable } from '@nestjs/common';
import { TreasuryMainWalletService } from '../../treasury-main-wallet.service';

@Injectable()
export class RevealMainWalletPrivateKeyUseCase {
  constructor(private readonly service: TreasuryMainWalletService) {}

  async execute(mainWalletId: string, actorUserId: string): Promise<{ privateKey: string }> {
    return this.service.revealPrivateKey(mainWalletId, actorUserId);
  }
}
