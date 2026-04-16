import { Injectable } from '@nestjs/common';
import type { UserRole } from '@/common/enums';
import type { ImportMainWalletDto } from '../../dto';
import { type MainWalletDto, TreasuryMainWalletService } from '../../treasury-main-wallet.service';

@Injectable()
export class ImportMainWalletUseCase {
  constructor(private readonly service: TreasuryMainWalletService) {}

  async execute(
    dto: ImportMainWalletDto,
    createdByUserId: string,
    actorRole: UserRole,
  ): Promise<MainWalletDto> {
    return this.service.importMainWallet(dto, createdByUserId, actorRole);
  }
}
