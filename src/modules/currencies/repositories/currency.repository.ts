import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { Currency } from '@/entities/currency.entity';
import { FindManyOptions } from 'typeorm';

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
   * Find currency by symbol
   * Custom method specific to Currency entity
   */
  async findBySymbol(symbol: string): Promise<Currency | null> {
    try {
      return await this.findOne({
        where: { symbol: symbol.toUpperCase() } as any,
      });
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
      return await this.find({
        where: { is_active: true } as any,
        order: { symbol: 'ASC' },
      });
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
      return await this.find({
        where: { is_tradable: true, is_active: true } as any,
        order: { symbol: 'ASC' },
      });
    } catch (error) {
      this.logger.error('Error finding tradable currencies', error);
      throw error;
    }
  }

  /**
   * Check if symbol exists
   */
  async symbolExists(symbol: string, excludeCurrencyId?: number): Promise<boolean> {
    try {
      const where: any = { symbol: symbol.toUpperCase() };
      if (excludeCurrencyId) {
        // For update operations, exclude current currency
        const currency = await this.findById(excludeCurrencyId);
        if (currency && (currency as any).symbol === symbol.toUpperCase()) {
          return false; // Same currency, symbol doesn't conflict
        }
      }
      return await this.exists(where);
    } catch (error) {
      this.logger.error(`Error checking symbol existence: ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Override create to normalize symbol to uppercase
   * Template Method Pattern: Override base method
   */
  async create(entity: Partial<Currency>): Promise<Currency> {
    // Normalize symbol to uppercase
    if (entity.symbol) {
      entity.symbol = entity.symbol.toUpperCase();
    }
    return super.create(entity);
  }

  /**
   * Override update to normalize symbol to uppercase
   */
  async update(id: number | string, entity: Partial<Currency>): Promise<Currency> {
    // Normalize symbol to uppercase if provided
    if (entity.symbol) {
      entity.symbol = entity.symbol.toUpperCase();
    }
    return super.update(id, entity);
  }
}
