import { Injectable } from '@nestjs/common';
import { DataSource, type FindManyOptions } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { calcSkip } from '@/common/utils/pagination.util';
import { newUuid } from '@/common/utils/uuid.util';
import { Currency } from '@/entities/currency.entity';

type CurrencyRow = Record<string, unknown>;

@Injectable()
export class CurrencyRepository extends BaseRepository<Currency> {
  constructor(dataSource: DataSource) {
    super(Currency, dataSource);
  }

  async findById(id: number | string): Promise<Currency | null> {
    const rows = await this.dataSource.query(
      `SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
       FROM currencies
       WHERE currency_id = $1
       LIMIT 1`,
      [id],
    );
    return this.mapRowToEntity(rows?.[0]);
  }

  async findBySymbol(symbol: string): Promise<Currency | null> {
    const rows = await this.dataSource.query(
      `SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
       FROM currencies
       WHERE UPPER(symbol) = $1
       LIMIT 1`,
      [symbol.toUpperCase()],
    );
    return this.mapRowToEntity(rows?.[0]);
  }

  async findActive(): Promise<Currency[]> {
    const rows = await this.dataSource.query(
      `SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
       FROM currencies
       WHERE is_active = true
       ORDER BY symbol ASC`,
    );
    return (rows ?? []).flatMap((row: CurrencyRow) => {
      const mapped = this.mapRowToEntity(row);
      return mapped ? [mapped] : [];
    });
  }

  async findTradable(): Promise<Currency[]> {
    const rows = await this.dataSource.query(
      `SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
       FROM currencies
       WHERE is_active = true AND is_tradable = true
       ORDER BY symbol ASC`,
    );
    return (rows ?? []).flatMap((row: CurrencyRow) => {
      const mapped = this.mapRowToEntity(row);
      return mapped ? [mapped] : [];
    });
  }

  async symbolExists(symbol: string, excludeCurrencyId?: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT EXISTS(
         SELECT 1
         FROM currencies
         WHERE UPPER(symbol) = $1
           AND ($2::text IS NULL OR currency_id <> $2)
       ) AS exists`,
      [symbol.toUpperCase(), excludeCurrencyId ?? null],
    );
    return rows?.[0]?.exists === true;
  }

  async create(entity: Partial<Currency>): Promise<Currency> {
    const currencyId = entity.currency_id ?? newUuid();
    const rows = await this.dataSource.query(
      `INSERT INTO currencies (
         currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7
       )
       RETURNING currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active`,
      [
        currencyId,
        entity.symbol?.toUpperCase(),
        entity.name,
        entity.precision_scale ?? 8,
        entity.min_withdraw ?? '0',
        entity.is_tradable ?? true,
        entity.is_active ?? true,
      ],
    );
    const created = this.mapRowToEntity(rows?.[0]);
    if (!created) throw new Error('Failed to fetch created currency');
    return created;
  }

  async update(id: number | string, entity: Partial<Currency>): Promise<Currency> {
    const updates: string[] = [];
    const params: unknown[] = [id];

    if (entity.symbol !== undefined) {
      params.push(entity.symbol?.toUpperCase() ?? null);
      updates.push(`symbol = $${params.length}`);
    }
    if (entity.name !== undefined) {
      params.push(entity.name);
      updates.push(`name = $${params.length}`);
    }
    if (entity.precision_scale !== undefined) {
      params.push(entity.precision_scale);
      updates.push(`precision_scale = $${params.length}`);
    }
    if (entity.min_withdraw !== undefined) {
      params.push(entity.min_withdraw);
      updates.push(`min_withdraw = $${params.length}`);
    }
    if (entity.is_tradable !== undefined) {
      params.push(entity.is_tradable);
      updates.push(`is_tradable = $${params.length}`);
    }
    if (entity.is_active !== undefined) {
      params.push(entity.is_active);
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new Error(`Currency with ID ${id} not found after update`);
      return existing;
    }

    const rows = await this.dataSource.query(
      `UPDATE currencies
       SET ${updates.join(', ')}
       WHERE currency_id = $1
       RETURNING currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active`,
      params,
    );
    const updated = this.mapRowToEntity(rows?.[0]);
    if (!updated) throw new Error(`Currency with ID ${id} not found after update`);
    return updated;
  }

  async delete(id: number | string): Promise<void> {
    await this.dataSource.query(`DELETE FROM currencies WHERE currency_id = $1`, [id]);
  }

  async findWithPagination(
    page: number = 1,
    limit: number = 10,
    options?: FindManyOptions<Currency> & { includeInactive?: boolean },
  ): Promise<{ data: Currency[]; total: number; page: number; limit: number }> {
    const skip = calcSkip(page, limit);
    const includeInactive = options?.includeInactive ?? false;

    const rows = await this.dataSource.query(
      `SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
       FROM currencies
       WHERE ($1::boolean = true OR is_active = true)
       ORDER BY symbol ASC
       OFFSET $2 LIMIT $3`,
      [includeInactive, skip, limit],
    );

    const totalRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
       FROM currencies
       WHERE ($1::boolean = true OR is_active = true)`,
      [includeInactive],
    );
    const total = Number(totalRows?.[0]?.total ?? 0);

    return {
      data: (rows ?? []).flatMap((row: CurrencyRow) => {
        const mapped = this.mapRowToEntity(row);
        return mapped ? [mapped] : [];
      }),
      total,
      page,
      limit,
    };
  }

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
      qb.andWhere('c.is_active = :isActive', { isActive: true });
    }

    const [rows, total] = await qb.skip(skip).take(params.limit).getManyAndCount();

    return {
      currencies: rows,
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  private mapRowToEntity(row: CurrencyRow | null | undefined): Currency | null {
    if (!row) return null;
    const currency = new Currency();
    currency.currency_id = String(row.currency_id ?? '');
    currency.symbol = String(row.symbol ?? '');
    currency.name = String(row.name ?? '');
    currency.precision_scale = Number(row.precision_scale ?? 8);
    currency.min_withdraw = String(row.min_withdraw ?? '0');
    currency.is_tradable = row.is_tradable === true || row.is_tradable === 1;
    currency.is_active = row.is_active === true || row.is_active === 1;
    return currency;
  }
}
