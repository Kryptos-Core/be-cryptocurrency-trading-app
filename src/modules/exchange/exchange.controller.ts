import { Controller, ParseBoolPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { ExchangeInfoSyncService } from './exchange-info-sync.service';

@ApiTags('Exchange')
@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchangeInfoSync: ExchangeInfoSyncService) {}

  /**
   * Sync currencies and market pairs from Binance exchangeInfo into DB.
   * Best practice: use this instead of manual insert for currencies/pairs.
   * ExchangeInfo is cached 1h to avoid Binance 418 (IP ban). Use ?forceRefresh=true sparingly.
   */
  @Post('sync-info')
  @UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @RequirePermissions(Permission.EXCHANGE_SYNC)
  @ApiOperation({
    summary: 'Sync from Binance',
    description:
      'Fetch Binance Spot exchangeInfo and upsert currencies + market pairs. Idempotent (skips existing). Cached 1h.',
  })
  @ApiQuery({
    name: 'forceRefresh',
    required: false,
    type: Boolean,
    description: 'Bypass cache and fetch fresh data (use sparingly to avoid Binance rate limit).',
  })
  @ApiResponse({ status: 200, description: 'Sync result (created/skipped counts and any errors).' })
  @ApiResponse({
    status: 503,
    description: 'Binance rate limit (IP banned). Retry after context.retryAfterSec.',
  })
  async syncFromBinance(
    @Query('forceRefresh', new ParseBoolPipe({ optional: true })) forceRefresh?: boolean,
  ) {
    return this.exchangeInfoSync.syncFromBinance(forceRefresh ?? false);
  }
}
