import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators';
import { OptionalJwtAuthGuard } from '@/common/guards';
import type { DashboardService } from './dashboard.service';

/**
 * Dashboard Controller
 * Single aggregated endpoint: replaces 3 separate calls (markets + tickers + wallets).
 * JWT tùy chọn: không token → vẫn trả top markets; có token hợp lệ → thêm ví + tổng danh mục.
 * Bearer sai/hết hạn → 401 (không lộ dữ liệu cá nhân).
 */
@ApiTags('dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
@UseGuards(OptionalJwtAuthGuard)
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
      'Top 10 markets by 24h volume (public). With a valid JWT: also wallet balances, portfolio total, and wallet counts.',
  })
  getDashboardSummary(@CurrentUser('userId') userId: string | undefined) {
    return this.dashboardService.getDashboardSummary(userId ?? null);
  }
}
