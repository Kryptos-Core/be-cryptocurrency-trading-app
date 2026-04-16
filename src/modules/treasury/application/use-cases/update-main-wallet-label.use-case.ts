import { Injectable } from '@nestjs/common';
import type { MainWalletDto, TreasuryMainWalletService } from '../../treasury-main-wallet.service';

@Injectable()
export class UpdateMainWalletLabelUseCase {
  constructor(private readonly service: TreasuryMainWalletService) {}

  async execute(
    mainWalletId: string,
    label: string | null | undefined,
    actorUserId: string,
  ): Promise<MainWalletDto> {
    return this.service.updateMainWalletLabel(mainWalletId, label, actorUserId);
  }
}
