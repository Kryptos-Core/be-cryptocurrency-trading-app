import { Injectable } from '@nestjs/common';
import type { MarketPair } from '@/entities/market-pair.entity';
import { UpdateMarketPairDto } from '../../dto';
import { MarketsService } from '../../markets.service';

/**
 * UpdateMarketPairUseCase — updates an existing market pair.
 * Delegates to MarketsService; use this from controllers instead of calling the service directly.
 */
@Injectable()
export class UpdateMarketPairUseCase {
  constructor(private readonly marketsService: MarketsService) {}

  async execute(pairId: string, dto: UpdateMarketPairDto): Promise<MarketPair> {
    return this.marketsService.update(pairId, dto);
  }
}
