import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_ADJUSTMENT_REPOSITORY,
  type AdminAdjustmentRepositoryPort,
} from '@/modules/wallets/domain/ports';
import type { AdminAdjustWalletResponseDto } from '@/modules/wallets/dto/admin-adjust-wallet.dto';

@Injectable()
export class GetAdminAdjustmentHistoryQuery {
  constructor(
    @Inject(ADMIN_ADJUSTMENT_REPOSITORY)
    private readonly adjustmentRepo: AdminAdjustmentRepositoryPort,
  ) {}

  async execute(
    targetUserId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AdminAdjustWalletResponseDto[]> {
    return this.adjustmentRepo.findByTarget(targetUserId, limit, offset);
  }
}
