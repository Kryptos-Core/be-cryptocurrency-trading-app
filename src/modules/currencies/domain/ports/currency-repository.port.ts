import type { Currency } from '@/entities/currency.entity';

/**
 * Port: Currency Repository
 * Domain-level abstraction for currency persistence.
 * Infrastructure layer provides the concrete implementation.
 */
export interface CurrencyRepositoryPort {
  findById(id: string): Promise<Currency | null>;

  findBySymbol(symbol: string): Promise<Currency | null>;

  findActive(): Promise<Currency[]>;

  findTradable(): Promise<Currency[]>;

  symbolExists(symbol: string, excludeCurrencyId?: string): Promise<boolean>;

  create(entity: Partial<Currency>): Promise<Currency>;

  update(id: string, entity: Partial<Currency>): Promise<Currency>;

  delete(id: string): Promise<void>;

  findWithPagination(
    page: number,
    limit: number,
    options?: any,
  ): Promise<{ data: Currency[]; total: number; page: number; limit: number }>;

  findWithSearch(params: {
    search?: string;
    isTradable?: boolean;
    isActive?: boolean;
    includeInactive?: boolean;
    page: number;
    limit: number;
  }): Promise<{ currencies: Currency[]; total: number; page: number; limit: number }>;
}

export const CURRENCY_REPOSITORY = Symbol('CURRENCY_REPOSITORY');
