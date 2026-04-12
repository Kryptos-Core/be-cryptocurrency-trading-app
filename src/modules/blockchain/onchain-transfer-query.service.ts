import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { nativeSymbolForChain } from '@/common/constants/chain-registry';
import { BlockchainNetwork } from '@/common/enums';
import { BadRequestException } from '@/common/exceptions';
import { calcSkip } from '@/common/utils/pagination.util';
import { CurrencyRepository } from '@/modules/currencies/repositories';
import { SystemConfigService } from '@/modules/system-config/system-config.service';

@Injectable()
export class OnchainTransferQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly currencyRepository: CurrencyRepository,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  /**
   * Lấy lịch sử giao dịch on-chain của user
   */
  async getTransactions(
    userId: string,
    limit: number = 50,
  ): Promise<
    Array<{
      txId: string;
      chain: string;
      type: string;
      txHash: string | null;
      fromAddress: string;
      toAddress: string;
      amount: string;
      status: string;
      confirmations: number;
      createdAt: string;
      confirmedAt: string | null;
      creditedAmount: string | null;
      creditedCurrencyId: string | null;
      conversionRate: string | null;
    }>
  > {
    const rows = await this.dataSource.query(
      `SELECT tx_id, chain, type, tx_hash, from_address, to_address, amount, status,
              confirmations, created_at, confirmed_at,
              credited_currency_id, credited_amount, conversion_rate
       FROM onchain_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit],
    );

    return (rows || []).map((r: any) => ({
      txId: r.tx_id,
      chain: r.chain,
      type: r.type,
      txHash: r.tx_hash ?? null,
      fromAddress: r.from_address,
      toAddress: r.to_address,
      amount: String(r.amount ?? '0'),
      status: r.status,
      confirmations: r.confirmations ?? 0,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      confirmedAt: r.confirmed_at
        ? r.confirmed_at instanceof Date
          ? r.confirmed_at.toISOString()
          : String(r.confirmed_at)
        : null,
      creditedAmount: r.credited_amount != null ? String(r.credited_amount) : null,
      creditedCurrencyId: r.credited_currency_id ?? null,
      conversionRate: r.conversion_rate != null ? String(r.conversion_rate) : null,
    }));
  }

  /**
   * Lấy chi tiết 1 giao dịch
   */
  async getTransactionById(userId: string, txId: string) {
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
    if (!r) {
      throw new BadRequestException('Giao dịch không tìm thấy', 'TX_NOT_FOUND');
    }

    return {
      txId: r.tx_id,
      chain: r.chain,
      type: r.type,
      txHash: r.tx_hash ?? null,
      fromAddress: r.from_address,
      toAddress: r.to_address,
      amount: String(r.amount ?? '0'),
      status: r.status,
      confirmations: r.confirmations ?? 0,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
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

  /** Filters for admin withdrawal list */
  async getAdminWithdrawals(filters: {
    userId?: string;
    status?: string;
    chain?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = calcSkip(page, limit);

    let sql = `
      SELECT tx.tx_id, tx.user_id, tx.chain, tx.type, tx.tx_hash, tx.from_address, tx.to_address,
             tx.amount, tx.status, tx.confirmations, tx.created_at, tx.confirmed_at,
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

    const data = rows.map((r: Record<string, unknown>) => ({
      txId: r.tx_id,
      userId: r.user_id,
      chain: r.chain,
      type: r.type,
      txHash: r.tx_hash ?? null,
      fromAddress: r.from_address,
      toAddress: r.to_address,
      amount: String(r.amount ?? '0'),
      status: r.status,
      confirmations: r.confirmations ?? 0,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      confirmedAt: r.confirmed_at
        ? r.confirmed_at instanceof Date
          ? r.confirmed_at.toISOString()
          : String(r.confirmed_at)
        : null,
      userEmail: r.user_email ?? null,
      userFirstName: r.user_first_name ?? null,
      userLastName: r.user_last_name ?? null,
    }));

    return { data, total, page, limit };
  }

  /** Single withdrawal detail with user info and wallet balance */
  async getAdminWithdrawalById(txId: string) {
    const rows = await this.dataSource.query(
      `SELECT tx.tx_id, tx.user_id, tx.linked_wallet_id, tx.chain, tx.type, tx.tx_hash,
              tx.from_address, tx.to_address, tx.amount, tx.status, tx.confirmations,
              tx.created_at, tx.confirmed_at,
              u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name
       FROM onchain_transactions tx
       LEFT JOIN users u ON tx.user_id = u.user_id
       WHERE tx.tx_id = ? AND tx.type = 'WITHDRAWAL'
       LIMIT 1`,
      [txId],
    );

    const r = rows?.[0];
    if (!r) {
      throw new BadRequestException('Giao dịch rút tiền không tìm thấy', 'TX_NOT_FOUND');
    }

    let userWalletBalance: string | null = null;
    try {
      const currencyId = await this.resolveWithdrawalCurrencyId(r.chain as BlockchainNetwork);
      const walletRows = await this.dataSource.query(
        `SELECT available, frozen FROM wallets WHERE user_id = ? AND currency_id = ? LIMIT 1`,
        [r.user_id, String(currencyId)],
      );
      const w = walletRows?.[0];
      if (w) {
        const avail = Number(w.available ?? 0);
        const froz = Number(w.frozen ?? 0);
        userWalletBalance = String(avail + froz);
      }
    } catch {
      // ignore
    }

    return {
      txId: r.tx_id,
      userId: r.user_id,
      linkedWalletId: r.linked_wallet_id ?? null,
      chain: r.chain,
      type: r.type,
      txHash: r.tx_hash ?? null,
      fromAddress: r.from_address,
      toAddress: r.to_address,
      amount: String(r.amount ?? '0'),
      status: r.status,
      confirmations: r.confirmations ?? 0,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      confirmedAt: r.confirmed_at
        ? r.confirmed_at instanceof Date
          ? r.confirmed_at.toISOString()
          : String(r.confirmed_at)
        : null,
      userEmail: r.user_email ?? null,
      userFirstName: r.user_first_name ?? null,
      userLastName: r.user_last_name ?? null,
      userWalletBalance,
    };
  }

  /** Stats for pending withdrawals */
  async getAdminWithdrawalStats() {
    const rows = await this.dataSource.query(
      `SELECT status, chain, COUNT(*) AS cnt, SUM(CAST(amount AS DECIMAL(36,18))) AS total
       FROM onchain_transactions
       WHERE type = 'WITHDRAWAL' AND status = 'PENDING'
       GROUP BY status, chain`,
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

  private async getChainAssetSymbol(chain: BlockchainNetwork): Promise<string> {
    let base: string;
    try {
      base = nativeSymbolForChain(chain);
    } catch {
      throw new BadRequestException('Mạng blockchain không được hỗ trợ', 'CHAIN_NOT_SUPPORTED');
    }
    const keyByBase: Record<string, string> = {
      ETH: 'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL',
      BNB: 'BLOCKCHAIN_WITHDRAW_BNB_SYMBOL',
      SOL: 'BLOCKCHAIN_WITHDRAW_SOL_SYMBOL',
      TRX: 'BLOCKCHAIN_WITHDRAW_TRON_SYMBOL',
      POL: 'BLOCKCHAIN_WITHDRAW_POL_SYMBOL',
      AVAX: 'BLOCKCHAIN_WITHDRAW_AVAX_SYMBOL',
      XDAI: 'BLOCKCHAIN_WITHDRAW_XDAI_SYMBOL',
      FTM: 'BLOCKCHAIN_WITHDRAW_FTM_SYMBOL',
    };
    const cfgKey = keyByBase[base];
    if (cfgKey) {
      const o = (await this.systemConfigService.get<string>(cfgKey))?.trim().toUpperCase();
      if (o) return o;
    }
    return base;
  }

  private async resolveWithdrawalCurrencyId(chain: BlockchainNetwork): Promise<string> {
    const symbol = await this.getChainAssetSymbol(chain);
    const currency = await this.currencyRepository.findBySymbol(symbol);
    if (!currency?.currency_id) {
      throw new BadRequestException(
        `Không tìm thấy currency ${symbol} để xử lý rút tiền`,
        'WITHDRAWAL_CURRENCY_NOT_FOUND',
      );
    }
    return String(currency.currency_id);
  }
}
