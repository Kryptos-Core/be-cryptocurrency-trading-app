import { Injectable } from '@nestjs/common';
import type { UpdateFxRateDto } from '../../dto/update-fx-rate.dto';
import { ExchangeRateService } from '../../exchange-rate.service';

/**
 * UpdateExchangeRateConfigUseCase — updates FX configuration for PayOS fiat deposits.
 *
 * Thin adapter that delegates to ExchangeRateService.updateAdminConfig.
 */
@Injectable()
export class UpdateExchangeRateConfigUseCase {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  async execute(dto: UpdateFxRateDto, actor: { userId: string }) {
    return this.exchangeRateService.updateAdminConfig(dto, actor);
  }
}
