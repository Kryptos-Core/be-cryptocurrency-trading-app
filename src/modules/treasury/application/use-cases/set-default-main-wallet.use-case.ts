import { Injectable } from '@nestjs/common';
import type { MainWalletDto, TreasuryMainWalletService } from '../../treasury-main-wallet.service';

@Injectable()
export class SetDefaultMainWalletUseCase {
  constructor(private readonly service: TreasuryMainWalletService) {}

  async execute(mainWalletId: string, actorUserId: string): Promise<MainWalletDto> {
    return this.service.setDefault(mainWalletId, actorUserId);
  }
}
