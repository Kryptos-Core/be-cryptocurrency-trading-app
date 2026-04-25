import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import type { TransactionContext } from '@/common/types/transaction-context';
import { AdminWalletAdjustment } from '@/entities/admin-wallet-adjustment.entity';
import type {
  AdminAdjustmentRepositoryPort,
  CreateAdjustmentParams,
} from '@/modules/wallets/domain/ports';
import type { AdminAdjustWalletResponseDto } from '@/modules/wallets/dto/admin-adjust-wallet.dto';

function toEntityManager(ctx: TransactionContext): EntityManager {
  return ctx as unknown as EntityManager;
}

type QueryRunnerLike = Pick<DataSource, 'query'> | Pick<EntityManager, 'query'>;
type AdjustmentRow = Record<string, unknown>;

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
    ctx?: TransactionContext,
  ): Promise<AdminAdjustWalletResponseDto> {
    const runner: QueryRunnerLike = ctx ? toEntityManager(ctx) : this.dataSource;
    const rows = await runner.query(
      `INSERT INTO admin_wallet_adjustments (
         adjustment_id, actor_user_id, target_user_id, currency_id, amount, type, note, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, NOW()
       )
       RETURNING adjustment_id, actor_user_id, target_user_id, currency_id, amount, type, note, created_at`,
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
    const row = rows?.[0] as AdjustmentRow | undefined;
    if (!row) {
      throw new Error('create admin wallet adjustment returned no row');
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
    const rows = await this.dataSource.query(
      `SELECT a.adjustment_id, a.actor_user_id, a.target_user_id, a.currency_id, a.amount, a.type,
              a.note, a.created_at, actor.email AS actor_email, target.email AS target_email,
              c.symbol AS currency_symbol
       FROM admin_wallet_adjustments a
       LEFT JOIN users actor ON actor.user_id = a.actor_user_id
       LEFT JOIN users target ON target.user_id = a.target_user_id
       LEFT JOIN currencies c ON c.currency_id = a.currency_id
       WHERE a.target_user_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [targetUserId, safeLimit, safeOffset],
    );
    return (rows ?? []).map((row: AdjustmentRow) => this.mapRow(row));
  }

  private mapRow(row: AdjustmentRow): AdminAdjustWalletResponseDto {
    return {
      adjustmentId: String(row.adjustment_id ?? ''),
      actorUserId: String(row.actor_user_id ?? ''),
      targetUserId: String(row.target_user_id ?? ''),
      currencyId: String(row.currency_id ?? ''),
      amount: String(row.amount ?? '0'),
      type: row.type as 'DEPOSIT' | 'WITHDRAW',
      note: row.note != null ? String(row.note) : null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ''),
      actorEmail: row.actor_email != null ? String(row.actor_email) : undefined,
      targetEmail: row.target_email != null ? String(row.target_email) : undefined,
      currencySymbol: row.currency_symbol != null ? String(row.currency_symbol) : undefined,
    };
  }
}
