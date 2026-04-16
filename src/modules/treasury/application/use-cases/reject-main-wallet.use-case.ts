import { Injectable } from '@nestjs/common';
import type { MainWalletDto, TreasuryMainWalletService } from '../../treasury-main-wallet.service';

@Injectable()
export class RejectMainWalletUseCase {
  constructor(private readonly service: TreasuryMainWalletService) {}

  async execute(mainWalletId: string, rejectorUserId: string): Promise<MainWalletDto> {
    return this.service.rejectMainWallet(mainWalletId, rejectorUserId);
  }
}
