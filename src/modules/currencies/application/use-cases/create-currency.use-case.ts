import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { CacheService } from '@/common/services';
import type { Currency } from '@/entities/currency.entity';
import { CURRENCY_REPOSITORY, type CurrencyRepositoryPort } from '../../domain/ports';
import type { CreateCurrencyDto } from '../../dto';

export interface CreateCurrencyResult {
  currency: Currency;
}

@Injectable()
export class CreateCurrencyUseCase {
  private readonly logger = new Logger(CreateCurrencyUseCase.name);

  constructor(
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepo: CurrencyRepositoryPort,
    private readonly cacheService: CacheService,
  ) {}

  async execute(dto: CreateCurrencyDto): Promise<CreateCurrencyResult> {
    const symbolExists = await this.currencyRepo.symbolExists(dto.symbol);
    if (symbolExists) {
      throw new ConflictException(
        `Currency with symbol ${dto.symbol} already exists`,
        'CURRENCY_SYMBOL_EXISTS',
      );
    }

    const currency = await this.currencyRepo.create({
      symbol: dto.symbol,
      name: dto.name,
      precision_scale: dto.precisionScale ?? 8,
      min_withdraw: dto.minWithdraw ?? '0',
      is_tradable: dto.isTradable ?? true,
      is_active: dto.isActive ?? true,
    });

    await this.invalidateCache();
    this.logger.log(`Currency created: ${currency.symbol} (ID: ${currency.currency_id})`);

    return { currency };
  }

  private async invalidateCache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern('currencies:*');
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${(err as Error).message}`);
    }
  }
}
