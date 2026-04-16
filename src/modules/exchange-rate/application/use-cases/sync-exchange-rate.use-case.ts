import { Injectable } from '@nestjs/common';
import type { SyncRateDto } from '../../dto/sync-rate.dto';
import { ExchangeRateService } from '../../exchange-rate.service';

/**
 * SyncExchangeRateUseCase — syncs USDT/VND rate from an external source.
 *
 * Thin adapter that delegates to ExchangeRateService.syncAdminConfig.
 */
@Injectable()
export class SyncExchangeRateUseCase {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  async execute(dto: SyncRateDto, actor: { userId: string }) {
    return this.exchangeRateService.syncAdminConfig(dto, actor);
  }
}
