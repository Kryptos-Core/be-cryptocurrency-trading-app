import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { CacheService } from '@/common/services';
import type { Currency } from '@/entities/currency.entity';
import { CURRENCY_REPOSITORY, type CurrencyRepositoryPort } from '../../domain/ports';
import type { UpdateCurrencyDto } from '../../dto';

export interface UpdateCurrencyResult {
  currency: Currency;
}

@Injectable()
export class UpdateCurrencyUseCase {
  private readonly logger = new Logger(UpdateCurrencyUseCase.name);

  constructor(
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepo: CurrencyRepositoryPort,
    private readonly cacheService: CacheService,
  ) {}

  async execute(currencyId: string, dto: UpdateCurrencyDto): Promise<UpdateCurrencyResult> {
    const existing = await this.currencyRepo.findById(currencyId);
    if (!existing) {
      throw new ConflictException(`Currency not found: ${currencyId}`);
    }

    if (dto.symbol && dto.symbol !== existing.symbol) {
      const symbolExists = await this.currencyRepo.symbolExists(dto.symbol, currencyId);
      if (symbolExists) {
        throw new ConflictException(
          `Currency with symbol ${dto.symbol} already exists`,
          'CURRENCY_SYMBOL_EXISTS',
        );
      }
    }

    const updateData: Partial<Currency> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.symbol !== undefined) updateData.symbol = dto.symbol;
    if (dto.precisionScale !== undefined) updateData.precision_scale = dto.precisionScale;
    if (dto.minWithdraw !== undefined) updateData.min_withdraw = dto.minWithdraw;
    if (dto.isTradable !== undefined) updateData.is_tradable = dto.isTradable;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;

    const currency = await this.currencyRepo.update(currencyId, updateData);
    await this.invalidateCache();
    this.logger.log(`Currency updated: ${currency.symbol} (ID: ${currencyId})`);

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
