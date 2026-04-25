import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { CurrencyLookupPort } from '@/modules/wallets/domain/ports';

/**
 * Infrastructure Adapter: Currency Lookup via raw SQL.
 * Provides currency symbol resolution without coupling to currencies module.
 */
@Injectable()
export class CurrencyLookupAdapter implements CurrencyLookupPort {
  private readonly logger = new Logger(CurrencyLookupAdapter.name);

  constructor(private readonly dataSource: DataSource) {}

  async getSymbol(currencyId: string): Promise<string> {
    try {
      const rows = await this.dataSource.query(
        'SELECT symbol FROM currencies WHERE currency_id = $1 LIMIT 1',
        [currencyId],
      );
      return rows?.[0]?.symbol ?? '';
    } catch (error) {
      this.logger.error(`Failed to get currency symbol for ${currencyId}: ${error}`);
      return '';
    }
  }
}
