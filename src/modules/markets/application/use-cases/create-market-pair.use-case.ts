import { Injectable } from '@nestjs/common';
import type { MarketPairRecord } from '@/modules/markets';
import { CreateMarketPairDto } from '../../dto';
import { MarketsService } from '../../markets.service';

/**
 * CreateMarketPairUseCase - creates a new market pair.
 * Delegates to MarketsService; use this from controllers instead of calling the service directly.
 */
@Injectable()
export class CreateMarketPairUseCase {
  constructor(private readonly marketsService: MarketsService) {}

  async execute(dto: CreateMarketPairDto): Promise<MarketPairRecord> {
    return this.marketsService.create(dto);
  }
}
