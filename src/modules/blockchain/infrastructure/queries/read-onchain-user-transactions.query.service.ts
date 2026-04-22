import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { OnchainTxRowDto } from '@/modules/blockchain/domain/ports';

/**
 * Merged list: DEPOSIT rows (read model + any on-chain row not yet projected) + other user-facing rows.
 * Excludes treasury-only types (FUND/SWEEP) — those belong on treasury admin APIs, not retail history.
 * Used when READ_MODEL_ONCHAIN_DEPOSITS is enabled.
 */
@Injectable()
export class ReadOnchainUserTransactionsQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  useReadModel(): boolean {
    const v = (this.config.get<string>('READ_MODEL_ONCHAIN_DEPOSITS') ?? '').trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(v);
  }

  async listMergedForUser(userId: string, limit: number): Promise<OnchainTxRowDto[]> {
    const lim = Math.min(Math.max(limit, 1), 200);
    const rows = await this.dataSource.query(
      `SELECT * FROM (
         SELECT r.tx_id, r.chain, r.type, r.tx_hash, r.from_address, r.to_address, r.amount, r.status,
                r.confirmations, r.created_at, r.confirmed_at,
                r.credited_currency_id, r.credited_amount, r.conversion_rate
         FROM read_onchain_deposits r
         WHERE r.user_id = ?
         UNION ALL
         SELECT tx.tx_id, tx.chain, tx.type, tx.tx_hash, tx.from_address, tx.to_address, tx.amount, tx.status,
                tx.confirmations, tx.created_at, tx.confirmed_at,
                tx.credited_currency_id, tx.credited_amount, tx.conversion_rate
         FROM onchain_transactions tx
         LEFT JOIN read_onchain_deposits r2
           ON r2.tx_id = tx.tx_id AND r2.user_id = tx.user_id
         WHERE tx.user_id = ?
           AND tx.type = 'DEPOSIT'
           AND r2.tx_id IS NULL
         UNION ALL
         SELECT tx.tx_id, tx.chain, tx.type, tx.tx_hash, tx.from_address, tx.to_address, tx.amount, tx.status,
                tx.confirmations, tx.created_at, tx.confirmed_at,
                tx.credited_currency_id, tx.credited_amount, tx.conversion_rate
         FROM onchain_transactions tx
         WHERE tx.user_id = ?
           AND tx.type <> 'DEPOSIT'
           AND tx.type NOT IN ('FUND', 'SWEEP')
       ) u
       ORDER BY u.created_at DESC
       LIMIT ?`,
      [userId, userId, userId, lim],
    );
    return (rows || []).map((r: Record<string, unknown>) => this.mapTxRow(r));
  }

  private mapTxRow(r: Record<string, unknown>): OnchainTxRowDto {
    return {
      txId: String(r.tx_id ?? ''),
      chain: String(r.chain ?? ''),
      type: String(r.type ?? ''),
      txHash: (r.tx_hash as string | null) ?? null,
      fromAddress: String(r.from_address ?? ''),
      toAddress: String(r.to_address ?? ''),
      amount: String(r.amount ?? '0'),
      status: String(r.status ?? ''),
      confirmations: Number(r.confirmations ?? 0),
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
      confirmedAt: r.confirmed_at
        ? r.confirmed_at instanceof Date
          ? (r.confirmed_at as Date).toISOString()
          : String(r.confirmed_at)
        : null,
      creditedAmount: r.credited_amount != null ? String(r.credited_amount) : null,
      creditedCurrencyId: (r.credited_currency_id as string | null) ?? null,
      conversionRate: r.conversion_rate != null ? String(r.conversion_rate) : null,
    };
  }
}
