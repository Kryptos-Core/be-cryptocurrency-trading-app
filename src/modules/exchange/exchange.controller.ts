import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards';
import { ExchangeInfoSyncService } from './exchange-info-sync.service';

@ApiTags('Exchange')
@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchangeInfoSync: ExchangeInfoSyncService) {}

  /**
   * Sync currencies and market pairs from Binance exchangeInfo into DB.
   * Best practice: use this instead of manual insert for currencies/pairs.
   */
  @Post('sync-info')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Sync from Binance',
    description:
      'Fetch Binance Spot exchangeInfo and upsert currencies + market pairs. Idempotent (skips existing).',
  })
  @ApiResponse({ status: 200, description: 'Sync result (created/skipped counts and any errors).' })
  async syncFromBinance() {
    return this.exchangeInfoSync.syncFromBinance();
  }
}
