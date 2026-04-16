import { Injectable } from '@nestjs/common';
import type { MainWalletDto, TreasuryMainWalletService } from '../../treasury-main-wallet.service';

@Injectable()
export class RejectMainWalletDeletionUseCase {
  constructor(private readonly service: TreasuryMainWalletService) {}

  async execute(mainWalletId: string, rejectorUserId: string): Promise<MainWalletDto> {
    return this.service.rejectMainWalletDeletion(mainWalletId, rejectorUserId);
  }
}
