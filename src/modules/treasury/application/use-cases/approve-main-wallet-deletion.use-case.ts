import { Injectable } from '@nestjs/common';
import type { TreasuryMainWalletService } from '../../treasury-main-wallet.service';

@Injectable()
export class ApproveMainWalletDeletionUseCase {
  constructor(private readonly service: TreasuryMainWalletService) {}

  async execute(mainWalletId: string, approverUserId: string): Promise<void> {
    return this.service.approveMainWalletDeletion(mainWalletId, approverUserId);
  }
}
