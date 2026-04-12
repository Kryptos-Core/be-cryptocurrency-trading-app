import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CURRENCY_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { BaseRepository } from '@/common/repositories';
import { calcSkip } from '@/common/utils/pagination.util';
import { newUuid } from '@/common/utils/uuid.util';
import { Currency } from '@/entities/currency.entity';

/**
 * Currency Repository
 * Repository Pattern: Data access abstraction
 * Extends BaseRepository: Inherits CRUD operations
 * Template Method Pattern: Can override base methods
 */
@Injectable()
export class CurrencyRepository extends BaseRepository<Currency> {
  constructor(dataSource: DataSource) {
    super(Currency, dataSource);
  }

  /**
   * Override findById to use stored procedure
   * Database Procedure Pattern: sp_currency_find_by_id
   */
  async findById(id: number | string): Promise<Currency | null> {
    const result = await this.dataSource.query(`CALL ${CURRENCY_STORE_PROCEDURE.FIND_BY_ID}(?)`, [
      id,
    ]);
    return this.mapProcedureResultToEntity(result[0][0]);
  }

  /**
   * Find currency by symbol
   * Custom method specific to Currency entity
   */
  async findBySymbol(symbol: string): Promise<Currency | null> {
    const result = await this.dataSource.query(
      `CALL ${CURRENCY_STORE_PROCEDURE.FIND_BY_SYMBOL}(?)`,
      [symbol.toUpperCase()],
    );
    return this.mapProcedureResultToEntity(result[0][0]);
  }

  /**
   * Find all active currencies
   * Custom method with business logic
   */
  async findActive(): Promise<Currency[]> {
    const result = await this.dataSource.query(`CALL ${CURRENCY_STORE_PROCEDURE.FIND_ACTIVE}()`);
    return result[0]?.map((row: any) => this.mapProcedureResultToEntity(row)) || [];
  }

  /**
   * Find all tradable currencies
   */
  async findTradable(): Promise<Currency[]> {
    const result = await this.dataSource.query(`CALL ${CURRENCY_STORE_PROCEDURE.FIND_TRADABLE}()`);
    return result[0]?.map((row: any) => this.mapProcedureResultToEntity(row)) || [];
  }

  /**
   * Check if symbol exists
   */
  async symbolExists(symbol: string, excludeCurrencyId?: string): Promise<boolean> {
    if (excludeCurrencyId) {
      const currency = await this.findById(excludeCurrencyId);
      if (currency && currency.symbol === symbol.toUpperCase()) {
        return false;
      }
    }

    await this.dataSource.query(`CALL ${CURRENCY_STORE_PROCEDURE.SYMBOL_EXISTS}(?, ?, @exists)`, [
      symbol.toUpperCase(),
      excludeCurrencyId || null,
    ]);
    const result = await this.dataSource.query('SELECT @exists as exists');
    return result?.[0]?.exists === 1 || result?.[0]?.exists === true;
  }

  /**
   * Override create (UUID v7: currency_id passed IN)
   */
  async create(entity: Partial<Currency>): Promise<Currency> {
    const currencyId = entity.currency_id ?? newUuid();
    const symbol = entity.symbol ? entity.symbol.toUpperCase() : null;

    await this.dataSource.query(`CALL ${CURRENCY_STORE_PROCEDURE.CREATE}(?, ?, ?, ?, ?, ?, ?)`, [
      currencyId,
      symbol,
      entity.name,
      entity.precision_scale ?? 8,
      entity.min_withdraw ?? '0',
      (entity.is_tradable ?? true) ? 1 : 0,
      (entity.is_active ?? true) ? 1 : 0,
    ]);

    const created = await this.findById(currencyId);
    if (!created) {
      throw new Error('Failed to fetch created currency');
    }
    return created;
  }

  /**
   * Override update to normalize symbol to uppercase
   */
  async update(id: number | string, entity: Partial<Currency>): Promise<Currency> {
    const symbol = entity.symbol ? entity.symbol.toUpperCase() : null;

    await this.dataSource.query(`CALL ${CURRENCY_STORE_PROCEDURE.UPDATE}(?, ?, ?, ?, ?, ?, ?)`, [
      id,
      symbol,
      entity.name ?? null,
      entity.precision_scale ?? null,
      entity.min_withdraw ?? null,
      entity.is_tradable ?? null,
      entity.is_active ?? null,
    ]);

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Currency with ID ${id} not found after update`);
    }
    return updated;
  }

  /**
   * Override delete to use stored procedure (soft delete)
   */
  async delete(id: number | string): Promise<void> {
    await this.dataSource.query(`CALL ${CURRENCY_STORE_PROCEDURE.DELETE}(?)`, [id]);
  }

  /**
   * Override findWithPagination to use stored procedures
   */
  async findWithPagination(
    page: number = 1,
    limit: number = 10,
    options?: any,
  ): Promise<{ data: Currency[]; total: number; page: number; limit: number }> {
    const skip = calcSkip(page, limit);
    const includeInactive = options?.includeInactive ?? false;

    const result = await this.dataSource.query(
      `CALL ${CURRENCY_STORE_PROCEDURE.FIND_ALL}(?, ?, ?)`,
      [skip, limit, includeInactive],
    );

    await this.dataSource.query(`CALL ${CURRENCY_STORE_PROCEDURE.COUNT}(?, @total)`, [
      includeInactive,
    ]);
    const totalResult = await this.dataSource.query('SELECT @total as total');
    const total = totalResult?.[0]?.total || 0;

    return {
      data: result[0]?.map((row: any) => this.mapProcedureResultToEntity(row)) || [],
      total,
      page,
      limit,
    };
  }

  /**
   * Full-text search + multi-filter via QueryBuilder.
   *
   * This path is used only when the caller supplies at least one of
   * `search`, `isTradable`, or `isActive`.  Stored procedures are not
   * modified; this method runs a lightweight inline query instead.
   *
   * Strategy Pattern: alternative data-access strategy alongside the SP path.
   */
  async findWithSearch(params: {
    search?: string;
    isTradable?: boolean;
    isActive?: boolean;
    includeInactive?: boolean;
    page: number;
    limit: number;
  }): Promise<{ currencies: Currency[]; total: number; page: number; limit: number }> {
    const skip = calcSkip(params.page, params.limit);
    const qb = this.dataSource
      .getRepository(Currency)
      .createQueryBuilder('c')
      .orderBy('c.symbol', 'ASC');

    if (params.search?.trim()) {
      const q = `%${params.search.trim().toUpperCase()}%`;
      qb.andWhere('(UPPER(c.symbol) LIKE :q OR UPPER(c.name) LIKE :q)', { q });
    }

    if (params.isTradable !== undefined) {
      qb.andWhere('c.is_tradable = :isTradable', { isTradable: params.isTradable });
    }

    if (params.isActive !== undefined) {
      qb.andWhere('c.is_active = :isActive', { isActive: params.isActive });
    } else if (!params.includeInactive) {
      // Honour the same semantics as sp_currency_find_all:
      // if includeInactive=false (default) and no explicit isActive filter,
      // only return active currencies.
      qb.andWhere('c.is_active = :isActive', { isActive: true });
    }

    const [rows, total] = await qb.skip(skip).take(params.limit).getManyAndCount();

    return {
      currencies: rows.map((row) => this.mapProcedureResultToEntity(row)!),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  /**
   * Map stored procedure result to Currency entity
   * Converts MySQL types to proper TypeScript types
   * - TINYINT(1) boolean fields: 1/0 → true/false
   * - DECIMAL fields: keep as string for precision
   */
  private mapProcedureResultToEntity(row: any): Currency | null {
    if (!row) return null;

    const currency = new Currency();
    currency.currency_id = String(row.currency_id ?? '');
    currency.symbol = row.symbol || '';
    currency.name = row.name || '';
    currency.precision_scale = row.precision_scale ?? 8;
    currency.min_withdraw = row.min_withdraw?.toString() || '0';
    currency.is_tradable = row.is_tradable === 1 || row.is_tradable === true;
    currency.is_active = row.is_active === 1 || row.is_active === true;

    return currency;
  }
}
