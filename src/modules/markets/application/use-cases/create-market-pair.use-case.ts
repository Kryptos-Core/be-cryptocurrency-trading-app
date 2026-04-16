import { Injectable } from '@nestjs/common';
import type { MarketPair } from '@/entities/market-pair.entity';
import { CreateMarketPairDto } from '../../dto';
import { MarketsService } from '../../markets.service';

/**
 * CreateMarketPairUseCase — creates a new market pair.
 * Delegates to MarketsService; use this from controllers instead of calling the service directly.
 */
@Injectable()
export class CreateMarketPairUseCase {
  constructor(private readonly marketsService: MarketsService) {}

  async execute(dto: CreateMarketPairDto): Promise<MarketPair> {
    return this.marketsService.create(dto);
  }
}
