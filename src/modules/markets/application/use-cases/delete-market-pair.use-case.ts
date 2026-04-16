import { Injectable } from '@nestjs/common';
import { MarketsService } from '../../markets.service';

/**
 * DeleteMarketPairUseCase — soft-deletes a market pair by setting is_active to false.
 * Delegates to MarketsService; use this from controllers instead of calling the service directly.
 */
@Injectable()
export class DeleteMarketPairUseCase {
  constructor(private readonly marketsService: MarketsService) {}

  async execute(pairId: string): Promise<void> {
    return this.marketsService.remove(pairId);
  }
}
