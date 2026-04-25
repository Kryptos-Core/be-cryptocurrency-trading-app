import { Inject, Injectable, Logger } from '@nestjs/common';
import { CacheService } from '@/common/services';
import type { Currency } from '@/entities/currency.entity';
import { CURRENCY_REPOSITORY, type CurrencyRepositoryPort } from '../../domain/ports';

@Injectable()
export class DeleteCurrencyUseCase {
  private readonly logger = new Logger(DeleteCurrencyUseCase.name);

  constructor(
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepo: CurrencyRepositoryPort,
    private readonly cacheService: CacheService,
  ) {}

  async execute(currencyId: string): Promise<void> {
    const existing = await this.currencyRepo.findById(currencyId);
    if (!existing) return;

    await this.currencyRepo.update(currencyId, { is_active: false } as Partial<Currency>);
    await this.invalidateCache();
    this.logger.log(`Currency soft-deleted: ${existing.symbol} (ID: ${currencyId})`);
  }

  async hardDelete(currencyId: string): Promise<void> {
    const existing = await this.currencyRepo.findById(currencyId);
    if (!existing) return;

    await this.currencyRepo.delete(currencyId);
    await this.invalidateCache();
    this.logger.log(`Currency hard-deleted: ${currencyId}`);
  }

  private async invalidateCache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern('currencies:*');
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${(err as Error).message}`);
    }
  }
}
