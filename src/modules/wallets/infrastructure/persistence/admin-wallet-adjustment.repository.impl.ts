import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ADMIN_WALLET_ADJUSTMENT_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { BaseRepository } from '@/common/repositories';
import { AdminWalletAdjustment } from '@/entities/admin-wallet-adjustment.entity';
import type { AdminAdjustWalletResponseDto } from '@/modules/wallets/dto/admin-adjust-wallet.dto';
import type {
  AdminAdjustmentRepositoryPort,
  CreateAdjustmentParams,
} from '@/modules/wallets/domain/ports';

/**
 * Infrastructure: Admin Wallet Adjustment Repository (TypeORM + stored procedures)
 * Implements AdminAdjustmentRepositoryPort for the persistence layer.
 */
@Injectable()
export class AdminWalletAdjustmentRepositoryImpl
  extends BaseRepository<AdminWalletAdjustment>
  implements AdminAdjustmentRepositoryPort
{
  constructor(dataSource: DataSource) {
    super(AdminWalletAdjustment, dataSource);
  }

  async createAdjustment(
    params: CreateAdjustmentParams,
    manager?: EntityManager,
  ): Promise<AdminAdjustWalletResponseDto> {
    const result = await (manager ?? this.dataSource).query(
      `CALL ${ADMIN_WALLET_ADJUSTMENT_STORE_PROCEDURE.CREATE}(?, ?, ?, ?, ?, ?, ?)`,
      [
        params.adjustmentId,
        params.actorUserId,
        params.targetUserId,
        params.currencyId,
        params.amount,
        params.type,
        params.note ?? null,
      ],
    );
    const row = result?.[0]?.[0];
    if (!row) {
      throw new Error('sp_admin_wallet_adjustment_create returned no row');
    }
    return this.mapRow(row);
  }

  async findByTarget(
    targetUserId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AdminAdjustWalletResponseDto[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const safeOffset = Math.max(offset, 0);
    const result = await this.dataSource.query(
      `CALL ${ADMIN_WALLET_ADJUSTMENT_STORE_PROCEDURE.FIND_BY_TARGET}(?, ?, ?)`,
      [targetUserId, safeLimit, safeOffset],
    );
    const rows: any[] = result?.[0] ?? [];
    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: any): AdminAdjustWalletResponseDto {
    return {
      adjustmentId: String(row.adjustment_id ?? ''),
      actorUserId: String(row.actor_user_id ?? ''),
      targetUserId: String(row.target_user_id ?? ''),
      currencyId: String(row.currency_id ?? ''),
      amount: String(row.amount ?? '0'),
      type: row.type as 'DEPOSIT' | 'WITHDRAW',
      note: row.note ?? null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ''),
      actorEmail: row.actor_email ?? undefined,
      targetEmail: row.target_email ?? undefined,
      currencySymbol: row.currency_symbol ?? undefined,
    };
  }
}
