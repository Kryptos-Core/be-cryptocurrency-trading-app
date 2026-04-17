import { Injectable } from '@nestjs/common';
import type { MarketPairRecord } from '@/modules/markets';
import { UpdateMarketPairDto } from '../../dto';
import { MarketsService } from '../../markets.service';

/**
 * UpdateMarketPairUseCase - updates an existing market pair.
 * Delegates to MarketsService; use this from controllers instead of calling the service directly.
 */
@Injectable()
export class UpdateMarketPairUseCase {
  constructor(private readonly marketsService: MarketsService) {}

  async execute(pairId: string, dto: UpdateMarketPairDto): Promise<MarketPairRecord> {
    return this.marketsService.update(pairId, dto);
  }
}
