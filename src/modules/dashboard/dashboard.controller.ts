import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '@/common/guards';
import { CurrentUser } from '@/common/decorators';

/**
 * Dashboard Controller
 * Single aggregated endpoint: replaces 3 separate calls (markets + tickers + wallets).
 * JWT required — returns user's wallet summary + portfolio total alongside top markets.
 */
@ApiTags('dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboard
   * Returns: top markets (sorted by 24h volume), user wallets with USD values,
   * portfolio total, wallet counts.
   */
  @Get()
  @ApiOperation({
    summary: 'Dashboard summary',
    description:
      'Aggregated dashboard data: top 10 markets by 24h volume with live tickers, user wallet balances with estimated USD values, and total portfolio value.',
  })
  getDashboardSummary(@CurrentUser('userId') userId: string) {
    return this.dashboardService.getDashboardSummary(userId ?? null);
  }
}
