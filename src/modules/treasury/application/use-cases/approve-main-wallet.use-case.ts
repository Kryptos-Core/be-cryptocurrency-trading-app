import { Injectable } from '@nestjs/common';
import { MainWalletDto, TreasuryMainWalletService } from '../../treasury-main-wallet.service';

@Injectable()
export class ApproveMainWalletUseCase {
  constructor(private readonly service: TreasuryMainWalletService) {}

  async execute(mainWalletId: string, approverUserId: string): Promise<MainWalletDto> {
    return this.service.approveMainWallet(mainWalletId, approverUserId);
  }
}
