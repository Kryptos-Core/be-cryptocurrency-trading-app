import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ADMIN_WALLET_ADJUSTMENT_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { BaseRepository } from '@/common/repositories';
import { AdminWalletAdjustment } from '@/entities/admin-wallet-adjustment.entity';
import { AdminAdjustWalletResponseDto } from '../dto/admin-adjust-wallet.dto';

export interface CreateAdjustmentParams {
  adjustmentId: string;
  actorUserId: string;
  targetUserId: string;
  currencyId: string;
  amount: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  note?: string;
}

/**
 * Admin Wallet Adjustment Repository
 * Repository Pattern: Data access for admin_wallet_adjustments audit table.
 * All writes go through stored procedures to enforce consistency.
 */
@Injectable()
export class AdminWalletAdjustmentRepository extends BaseRepository<AdminWalletAdjustment> {
  constructor(dataSource: DataSource) {
    super(AdminWalletAdjustment, dataSource);
  }

  /**
   * Tạo bản ghi điều chỉnh mới và trả về row đầy đủ (kèm email, symbol).
   * Gọi stored procedure sp_admin_wallet_adjustment_create.
   */
  async createAdjustment(
    params: CreateAdjustmentParams,
    manager?: EntityManager,
  ): Promise<AdminAdjustWalletResponseDto> {
    try {
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
    } catch (error) {
      this.logger.error('Error creating admin wallet adjustment', error);
      throw error;
    }
  }

  /**
   * Lấy danh sách điều chỉnh theo người dùng đích (phân trang).
   * Gọi stored procedure sp_admin_wallet_adjustment_find_by_target.
   */
  async findByTarget(
    targetUserId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AdminAdjustWalletResponseDto[]> {
    try {
      const safeLimit = Math.min(Math.max(limit, 1), 200);
      const safeOffset = Math.max(offset, 0);
      const result = await this.dataSource.query(
        `CALL ${ADMIN_WALLET_ADJUSTMENT_STORE_PROCEDURE.FIND_BY_TARGET}(?, ?, ?)`,
        [targetUserId, safeLimit, safeOffset],
      );
      const rows: any[] = result?.[0] ?? [];
      return rows.map((row) => this.mapRow(row));
    } catch (error) {
      this.logger.error(`Error finding adjustments for target user ${targetUserId}`, error);
      throw error;
    }
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
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ''),
      actorEmail: row.actor_email ?? undefined,
      targetEmail: row.target_email ?? undefined,
      currencySymbol: row.currency_symbol ?? undefined,
    };
  }
}
