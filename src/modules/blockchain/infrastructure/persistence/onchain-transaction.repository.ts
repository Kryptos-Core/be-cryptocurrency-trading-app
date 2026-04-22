import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import type { TransactionContext } from '@/common/types/transaction-context';
import { calcSkip } from '@/common/utils/pagination.util';
import { OnchainTransaction } from '@/modules/blockchain';
import type {
  AdminUnmatchedDepositFilters,
  AdminUnmatchedDepositRowDto,
  AdminWithdrawalDetailDto,
  AdminWithdrawalFilters,
  AdminWithdrawalRowDto,
  OnchainTransactionRepositoryPort,
  OnchainTxRowDto,
} from '@/modules/blockchain/domain/ports';

function toEntityManager(ctx: TransactionContext): EntityManager {
  return ctx as unknown as EntityManager;
}

/**
 * Infrastructure: Onchain Transaction Repository (TypeORM + raw SQL)
 * Implements OnchainTransactionRepositoryPort — contains all persistence logic
 * for onchain_transactions table previously scattered across services.
 */
@Injectable()
export class OnchainTransactionRepository implements OnchainTransactionRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  async findByChainAndTxHash(
    chain: string,
    txHash: string,
    logIndex: number = 0,
  ): Promise<OnchainTransaction | null> {
    return this.dataSource.getRepository(OnchainTransaction).findOne({
      where: { chain, tx_hash: txHash, log_index: logIndex },
    });
  }

  async findByIdAndUserId(txId: string, userId: string): Promise<OnchainTransaction | null> {
    return this.dataSource.getRepository(OnchainTransaction).findOne({
      where: { tx_id: txId, user_id: userId },
    });
  }

  async findByUserPaginated(
    userId: string,
    filters: { type?: string; chain?: string; status?: string },
    limit: number,
    offset: number,
  ): Promise<{ items: OnchainTransaction[]; total: number }> {
    const qb = this.dataSource
      .getRepository(OnchainTransaction)
      .createQueryBuilder('tx')
      .where('tx.user_id = :userId', { userId })
      .orderBy('tx.created_at', 'DESC')
      .skip(offset)
      .take(limit);

    if (filters.type) qb.andWhere('tx.type = :type', { type: filters.type });
    if (filters.chain) qb.andWhere('tx.chain = :chain', { chain: filters.chain });
    if (filters.status) qb.andWhere('tx.status = :status', { status: filters.status });

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async create(data: Partial<OnchainTransaction>): Promise<OnchainTransaction> {
    const repo = this.dataSource.getRepository(OnchainTransaction);
    const entity = repo.create({ tx_id: uuidv7(), ...data });
    return repo.save(entity);
  }

  async createWithinTransaction(
    ctx: TransactionContext,
    data: Partial<OnchainTransaction>,
  ): Promise<OnchainTransaction> {
    const repo = toEntityManager(ctx).getRepository(OnchainTransaction);
    const entity = repo.create({ tx_id: uuidv7(), ...data });
    return repo.save(entity);
  }

  async updateStatus(txId: string, status: string, extra?: Record<string, any>): Promise<void> {
    const update: Record<string, any> = {
      status: status as OnchainTransaction['status'],
    };

    if (extra) {
      if (extra.confirmations !== undefined) update.confirmations = extra.confirmations;
      if (extra.confirmed_at !== undefined) update.confirmed_at = extra.confirmed_at;
      if (extra.credited_currency_id !== undefined)
        update.credited_currency_id = extra.credited_currency_id;
      if (extra.credited_amount !== undefined) update.credited_amount = extra.credited_amount;
      if (extra.conversion_rate !== undefined) update.conversion_rate = extra.conversion_rate;
    }

    await this.dataSource.getRepository(OnchainTransaction).update({ tx_id: txId }, update);
  }

  async updateStatusWithinTransaction(
    ctx: TransactionContext,
    txId: string,
    status: string,
    extra?: Record<string, any>,
  ): Promise<void> {
    const update: Record<string, any> = {
      status: status as OnchainTransaction['status'],
    };

    if (extra) {
      if (extra.confirmations !== undefined) update.confirmations = extra.confirmations;
      if (extra.confirmed_at !== undefined) update.confirmed_at = extra.confirmed_at;
      if (extra.credited_currency_id !== undefined)
        update.credited_currency_id = extra.credited_currency_id;
      if (extra.credited_amount !== undefined) update.credited_amount = extra.credited_amount;
      if (extra.conversion_rate !== undefined) update.conversion_rate = extra.conversion_rate;
    }

    await toEntityManager(ctx).getRepository(OnchainTransaction).update({ tx_id: txId }, update);
  }

  async updateWithTxHash(txId: string, txHash: string, status: string): Promise<void> {
    await this.dataSource.getRepository(OnchainTransaction).update(
      { tx_id: txId },
      {
        tx_hash: txHash,
        status: status as OnchainTransaction['status'],
      },
    );
  }

  async findPendingWithdrawals(limit: number): Promise<OnchainTransaction[]> {
    return this.dataSource.getRepository(OnchainTransaction).find({
      where: { type: 'WITHDRAWAL', status: 'PENDING' },
      order: { created_at: 'ASC' },
      take: limit,
    });
  }

  async updateCreditInfo(txId: string, creditTxId: string, creditedAt: Date): Promise<void> {
    await this.dataSource.query(
      `UPDATE onchain_transactions
       SET credited_currency_id = ?, confirmed_at = ?
       WHERE tx_id = ?`,
      [creditTxId, creditedAt, txId],
    );
  }

  async findById(txId: string): Promise<OnchainTransaction | null> {
    return this.dataSource.getRepository(OnchainTransaction).findOne({
      where: { tx_id: txId },
    });
  }

  async updateCreditConversion(
    txId: string,
    creditCurrencyId: string,
    creditAmount: string,
    conversionRate: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE onchain_transactions
       SET credited_currency_id = ?, credited_amount = ?, conversion_rate = ?
       WHERE tx_id = ?`,
      [creditCurrencyId, creditAmount, conversionRate, txId],
    );
  }

  async updateCreditConversionWithinTransaction(
    ctx: TransactionContext,
    txId: string,
    creditCurrencyId: string,
    creditAmount: string,
    conversionRate: string,
  ): Promise<void> {
    await toEntityManager(ctx).query(
      `UPDATE onchain_transactions
       SET credited_currency_id = ?, credited_amount = ?, conversion_rate = ?
       WHERE tx_id = ?`,
      [creditCurrencyId, creditAmount, conversionRate, txId],
    );
  }

  async updateAfterManualApproval(
    txId: string,
    txHash: string | null,
    fromAddress: string,
    status: string,
    confirmedAt: Date | null,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE onchain_transactions
       SET tx_hash = ?, from_address = ?, status = ?, confirmations = 0, confirmed_at = ?
       WHERE tx_id = ?`,
      [txHash, fromAddress, status, confirmedAt, txId],
    );
  }

  async findPendingManualWithdrawals(limit: number): Promise<OnchainTransaction[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const rows = await this.dataSource.query(
      `SELECT *
       FROM onchain_transactions
       WHERE type = 'WITHDRAWAL' AND status = 'PENDING' AND tx_hash IS NULL
       ORDER BY created_at ASC
       LIMIT ?`,
      [safeLimit],
    );
    return rows || [];
  }

  async setMatchedUser(
    ctx: TransactionContext,
    txId: string,
    userId: string,
    status: string,
  ): Promise<void> {
    await toEntityManager(ctx).query(
      `UPDATE onchain_transactions SET user_id = ?, status = ? WHERE tx_id = ?`,
      [userId, status, txId],
    );
  }

  // ─── Read-model queries ─────────────────────────────────────────────────

  async listByUser(userId: string, limit: number): Promise<OnchainTxRowDto[]> {
    const rows = await this.dataSource.query(
      `SELECT tx_id, chain, type, tx_hash, from_address, to_address, amount, status,
              confirmations, created_at, confirmed_at,
              credited_currency_id, credited_amount, conversion_rate
       FROM onchain_transactions
       WHERE user_id = ?
         AND type NOT IN ('FUND', 'SWEEP')
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit],
    );

    return (rows || []).map(this.mapTxRow);
  }

  async getByIdAndUser(userId: string, txId: string): Promise<OnchainTxRowDto | null> {
    const rows = await this.dataSource.query(
      `SELECT tx_id, chain, type, tx_hash, from_address, to_address, amount, status,
              confirmations, created_at, confirmed_at,
              credited_currency_id, credited_amount, conversion_rate
       FROM onchain_transactions
       WHERE tx_id = ? AND user_id = ?
       LIMIT 1`,
      [txId, userId],
    );

    const r = rows?.[0];
    if (!r) return null;
    return this.mapTxRow(r);
  }

  async listAdminWithdrawals(
    filters: AdminWithdrawalFilters,
  ): Promise<{ data: AdminWithdrawalRowDto[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = calcSkip(page, limit);

    let sql = `
      SELECT tx.tx_id, tx.user_id, tx.chain, tx.type, tx.tx_hash, tx.from_address, tx.to_address,
             tx.amount, tx.status, tx.confirmations, tx.created_at, tx.confirmed_at,
             tx.credited_currency_id, tx.credited_amount, tx.conversion_rate,
             u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name
      FROM onchain_transactions tx
      LEFT JOIN users u ON tx.user_id = u.user_id
      WHERE tx.type = 'WITHDRAWAL'
    `;
    const params: (string | number)[] = [];

    if (filters.userId) {
      sql += ` AND tx.user_id = ?`;
      params.push(filters.userId);
    }
    if (filters.status) {
      sql += ` AND tx.status = ?`;
      params.push(filters.status);
    }
    if (filters.chain) {
      sql += ` AND tx.chain = ?`;
      params.push(filters.chain);
    }
    if (filters.dateFrom) {
      sql += ` AND tx.created_at >= ?`;
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      sql += ` AND tx.created_at <= ?`;
      params.push(`${filters.dateTo} 23:59:59`);
    }
    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`;
      sql += ` AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR tx.to_address LIKE ? OR tx.tx_id LIKE ? OR tx.tx_hash LIKE ?)`;
      params.push(s, s, s, s, s, s);
    }

    const countSql = `
      SELECT COUNT(*) AS total FROM onchain_transactions tx
      LEFT JOIN users u ON tx.user_id = u.user_id
      WHERE tx.type = 'WITHDRAWAL'
      ${filters.userId ? ' AND tx.user_id = ?' : ''}
      ${filters.status ? ' AND tx.status = ?' : ''}
      ${filters.chain ? ' AND tx.chain = ?' : ''}
      ${filters.dateFrom ? ' AND tx.created_at >= ?' : ''}
      ${filters.dateTo ? ' AND tx.created_at <= ?' : ''}
      ${filters.search?.trim() ? ' AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR tx.to_address LIKE ? OR tx.tx_id LIKE ? OR tx.tx_hash LIKE ?)' : ''}
    `;
    const countRows = await this.dataSource.query(countSql.trim(), params);
    const total = Number(countRows?.[0]?.total ?? 0);

    sql += ` ORDER BY tx.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, skip);

    const rows = await this.dataSource.query(sql, params);

    const data = (rows || []).map((r: Record<string, unknown>) => ({
      ...this.mapTxRow(r),
      userId: String(r.user_id ?? ''),
      userEmail: (r.user_email as string) ?? null,
      userFirstName: (r.user_first_name as string) ?? null,
      userLastName: (r.user_last_name as string) ?? null,
    }));

    return { data, total, page, limit };
  }

  async getAdminWithdrawalDetail(txId: string): Promise<AdminWithdrawalDetailDto | null> {
    const rows = await this.dataSource.query(
      `SELECT tx.tx_id, tx.user_id, tx.linked_wallet_id, tx.chain, tx.type, tx.tx_hash,
              tx.from_address, tx.to_address, tx.amount, tx.status, tx.confirmations,
              tx.created_at, tx.confirmed_at,
              tx.credited_currency_id, tx.credited_amount, tx.conversion_rate,
              u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name
       FROM onchain_transactions tx
       LEFT JOIN users u ON tx.user_id = u.user_id
       WHERE tx.tx_id = ? AND tx.type = 'WITHDRAWAL'
       LIMIT 1`,
      [txId],
    );

    const r = rows?.[0];
    if (!r) return null;

    let userWalletBalance: string | null = null;
    try {
      const walletRows = await this.dataSource.query(
        `SELECT available, frozen FROM wallets WHERE user_id = ? LIMIT 1`,
        [r.user_id],
      );
      const w = walletRows?.[0];
      if (w) {
        const avail = Number(w.available ?? 0);
        const froz = Number(w.frozen ?? 0);
        userWalletBalance = String(avail + froz);
      }
    } catch {
      // ignore — non-critical enrichment
    }

    return {
      ...this.mapTxRow(r),
      userId: String(r.user_id ?? ''),
      linkedWalletId: r.linked_wallet_id ?? null,
      userEmail: r.user_email ?? null,
      userFirstName: r.user_first_name ?? null,
      userLastName: r.user_last_name ?? null,
      userWalletBalance,
    };
  }

  async getWithdrawalStats(): Promise<{
    pendingCount: number;
    pendingTotalByChain: Record<string, string>;
  }> {
    const rows = await this.dataSource.query(
      `SELECT chain, COUNT(*) AS cnt, SUM(CAST(amount AS DECIMAL(36,18))) AS total
       FROM onchain_transactions
       WHERE type = 'WITHDRAWAL' AND status = 'PENDING'
       GROUP BY chain`,
    );

    let pendingCount = 0;
    const pendingTotalByChain: Record<string, string> = {};

    for (const row of rows ?? []) {
      pendingCount += Number(row.cnt ?? 0);
      const chain = row.chain as string;
      if (chain) {
        pendingTotalByChain[chain] = String(row.total ?? '0');
      }
    }

    return { pendingCount, pendingTotalByChain };
  }

  async listAdminUnmatchedDeposits(
    filters: AdminUnmatchedDepositFilters,
  ): Promise<{ data: AdminUnmatchedDepositRowDto[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = calcSkip(page, limit);

    let sql = `
      SELECT tx.tx_id, tx.user_id, tx.chain, tx.type, tx.tx_hash, tx.from_address, tx.to_address,
             tx.amount, tx.status, tx.confirmations, tx.created_at, tx.confirmed_at,
             tx.credited_currency_id, tx.credited_amount, tx.conversion_rate,
             mr.match_id AS pending_match_id,
             mr.requested_user_id AS pending_match_requested_user_id
      FROM onchain_transactions tx
      LEFT JOIN deposit_match_requests mr ON mr.tx_id = tx.tx_id AND mr.status = 'PENDING'
      WHERE tx.status = 'UNMATCHED'
    `;
    const params: (string | number)[] = [];

    if (filters.chain) {
      sql += ` AND tx.chain = ?`;
      params.push(filters.chain);
    }
    if (filters.dateFrom) {
      sql += ` AND tx.created_at >= ?`;
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      sql += ` AND tx.created_at <= ?`;
      params.push(`${filters.dateTo} 23:59:59`);
    }
    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`;
      sql += ` AND (tx.from_address LIKE ? OR tx.tx_hash LIKE ? OR tx.tx_id LIKE ?)`;
      params.push(s, s, s);
    }

    const countSql = `
      SELECT COUNT(*) AS total FROM onchain_transactions tx
      WHERE tx.status = 'UNMATCHED'
      ${filters.chain ? ' AND tx.chain = ?' : ''}
      ${filters.dateFrom ? ' AND tx.created_at >= ?' : ''}
      ${filters.dateTo ? ' AND tx.created_at <= ?' : ''}
      ${filters.search?.trim() ? ' AND (tx.from_address LIKE ? OR tx.tx_hash LIKE ? OR tx.tx_id LIKE ?)' : ''}
    `;
    const countParams: (string | number)[] = [];
    if (filters.chain) countParams.push(filters.chain);
    if (filters.dateFrom) countParams.push(filters.dateFrom);
    if (filters.dateTo) countParams.push(`${filters.dateTo} 23:59:59`);
    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`;
      countParams.push(s, s, s);
    }

    const countRows = await this.dataSource.query(countSql.trim(), countParams);
    const total = Number(countRows?.[0]?.total ?? 0);

    sql += ` ORDER BY tx.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, skip);

    const rows = await this.dataSource.query(sql, params);

    const data = (rows || []).map((r: Record<string, unknown>) => ({
      ...this.mapTxRow(r),
      userId: r.user_id ? String(r.user_id) : null,
      pendingMatchId: r.pending_match_id ? String(r.pending_match_id) : null,
      pendingMatchRequestedUserId: r.pending_match_requested_user_id
        ? String(r.pending_match_requested_user_id)
        : null,
    }));

    return { data, total, page, limit };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private mapTxRow(r: Record<string, any>): OnchainTxRowDto {
    return {
      txId: String(r.tx_id ?? ''),
      chain: String(r.chain ?? ''),
      type: String(r.type ?? ''),
      txHash: r.tx_hash ?? null,
      fromAddress: String(r.from_address ?? ''),
      toAddress: String(r.to_address ?? ''),
      amount: String(r.amount ?? '0'),
      status: String(r.status ?? ''),
      confirmations: Number(r.confirmations ?? 0),
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
      confirmedAt: r.confirmed_at
        ? r.confirmed_at instanceof Date
          ? r.confirmed_at.toISOString()
          : String(r.confirmed_at)
        : null,
      creditedAmount: r.credited_amount != null ? String(r.credited_amount) : null,
      creditedCurrencyId: r.credited_currency_id ?? null,
      conversionRate: r.conversion_rate != null ? String(r.conversion_rate) : null,
    };
  }
}
