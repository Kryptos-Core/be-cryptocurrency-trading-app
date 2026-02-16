import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
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
    try {
      const result = await this.dataSource.query('CALL sp_currency_find_by_id(?)', [
        id,
      ]);
      return this.mapProcedureResultToEntity(result[0][0]);
    } catch (error) {
      this.logger.error(`Error finding currency by ID: ${id}`, error);
      throw error;
    }
  }

  /**
   * Find currency by symbol
   * Custom method specific to Currency entity
   */
  async findBySymbol(symbol: string): Promise<Currency | null> {
    try {
      const result = await this.dataSource.query('CALL sp_currency_find_by_symbol(?)', [
        symbol.toUpperCase(),
      ]);
      return this.mapProcedureResultToEntity(result[0][0]);
    } catch (error) {
      this.logger.error(`Error finding currency by symbol: ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Find all active currencies
   * Custom method with business logic
   */
  async findActive(): Promise<Currency[]> {
    try {
      const result = await this.dataSource.query('CALL sp_currency_find_active()');
      return result[0]?.map((row: any) => this.mapProcedureResultToEntity(row)) || [];
    } catch (error) {
      this.logger.error('Error finding active currencies', error);
      throw error;
    }
  }

  /**
   * Find all tradable currencies
   */
  async findTradable(): Promise<Currency[]> {
    try {
      const result = await this.dataSource.query('CALL sp_currency_find_tradable()');
      return result[0]?.map((row: any) => this.mapProcedureResultToEntity(row)) || [];
    } catch (error) {
      this.logger.error('Error finding tradable currencies', error);
      throw error;
    }
  }

  /**
   * Check if symbol exists
   */
  async symbolExists(symbol: string, excludeCurrencyId?: string): Promise<boolean> {
    try {
      if (excludeCurrencyId) {
        const currency = await this.findById(excludeCurrencyId);
        if (currency && currency.symbol === symbol.toUpperCase()) {
          return false;
        }
      }

      await this.dataSource.query(
        'CALL sp_currency_symbol_exists(?, ?, @exists)',
        [symbol.toUpperCase(), excludeCurrencyId || null],
      );
      const result = await this.dataSource.query('SELECT @exists as exists');
      return result?.[0]?.exists === 1 || result?.[0]?.exists === true;
    } catch (error) {
      this.logger.error(`Error checking symbol existence: ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Override create (UUID v7: currency_id passed IN)
   */
  async create(entity: Partial<Currency>): Promise<Currency> {
    try {
      const currencyId = entity.currency_id ?? newUuid();
      const symbol = entity.symbol ? entity.symbol.toUpperCase() : null;

      await this.dataSource.query('CALL sp_currency_create(?, ?, ?, ?, ?, ?, ?)', [
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
    } catch (error) {
      this.logger.error('Error creating currency', error);
      throw error;
    }
  }

  /**
   * Override update to normalize symbol to uppercase
   */
  async update(id: number | string, entity: Partial<Currency>): Promise<Currency> {
    try {
      const symbol = entity.symbol ? entity.symbol.toUpperCase() : null;

      await this.dataSource.query('CALL sp_currency_update(?, ?, ?, ?, ?, ?, ?)', [
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
    } catch (error) {
      this.logger.error(`Error updating currency with ID: ${id}`, error);
      throw error;
    }
  }

  /**
   * Override delete to use stored procedure (soft delete)
   */
  async delete(id: number | string): Promise<void> {
    try {
      await this.dataSource.query('CALL sp_currency_delete(?)', [id]);
    } catch (error) {
      this.logger.error(`Error deleting currency with ID: ${id}`, error);
      throw error;
    }
  }

  /**
   * Override findWithPagination to use stored procedures
   */
  async findWithPagination(
    page: number = 1,
    limit: number = 10,
    options?: any,
  ): Promise<{ data: Currency[]; total: number; page: number; limit: number }> {
    try {
      const skip = (page - 1) * limit;
      const includeInactive = options?.includeInactive ?? false;

      const result = await this.dataSource.query('CALL sp_currency_find_all(?, ?, ?)', [
        skip,
        limit,
        includeInactive,
      ]);

      await this.dataSource.query('CALL sp_currency_count(?, @total)', [includeInactive]);
      const totalResult = await this.dataSource.query('SELECT @total as total');
      const total = totalResult?.[0]?.total || 0;

      return {
        data: result[0]?.map((row: any) => this.mapProcedureResultToEntity(row)) || [],
        total,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error('Error finding currencies with pagination', error);
      throw error;
    }
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
