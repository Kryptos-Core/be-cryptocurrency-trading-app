import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotFoundException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import type { Currency } from '@/entities/currency.entity';
import { CURRENCY_REPOSITORY, type CurrencyRepositoryPort } from '../../domain/ports';

const CACHE_KEY_PREFIX = 'currencies:';
const CACHE_TTL = 3600;

@Injectable()
export class GetCurrencyByIdQuery {
  private readonly logger = new Logger(GetCurrencyByIdQuery.name);

  constructor(
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepo: CurrencyRepositoryPort,
    private readonly cacheService: CacheService,
  ) {}

  async execute(currencyId: string): Promise<Currency> {
    const cacheKey = `${CACHE_KEY_PREFIX}id:${currencyId}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const currency = await this.currencyRepo.findById(currencyId);
        if (!currency) {
          throw new NotFoundException('Currency', currencyId);
        }
        return currency;
      },
      CACHE_TTL,
    );
  }

  async executeBySymbol(symbol: string): Promise<Currency> {
    const cacheKey = `${CACHE_KEY_PREFIX}symbol:${symbol.toUpperCase()}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const currency = await this.currencyRepo.findBySymbol(symbol);
        if (!currency) {
          throw new NotFoundException('Currency', symbol);
        }
        return currency;
      },
      CACHE_TTL,
    );
  }
}
