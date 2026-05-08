import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators';
import { RequirePermissions, RequireRoles } from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { MarketReadModelReconciliationService } from './market-read-model-reconciliation.service';

/**
 * Projection Health Controller
 * Exposes read-model projection lag and reconciliation health for ops observability.
 *
 * Phase 11: Projection health monitoring - Quick win
 * - Fix Promise.all bug in getProjectionHealth()
 * - Emit lag metrics via Prometheus
 * - Health endpoint at /admin/projection/health
 */
@ApiTags('projection-health')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@Controller('admin/projection')
export class ProjectionHealthController {
  constructor(
    private readonly marketReadModelReconciliationService: MarketReadModelReconciliationService,
  ) {}

  @Get('health')
  @Public() // Health endpoints should be public for load balancer checks
  @ApiOperation({
    summary: 'Projection health status (public for monitoring)',
    description:
      'Returns health status of market read-model projections (trades, tickers, OHLCV) including lag measurements. Suitable for load balancer health checks and Grafana dashboards.',
  })
  @ApiQuery({ name: 'windowHours', required: false, type: Number, example: 24 })
  @ApiQuery({
    name: 'intervals',
    required: false,
    type: String,
    example: '60,300,900,3600,14400,86400',
    description: 'Comma-separated OHLCV intervals in seconds.',
  })
  async getProjectionHealth(
    @Query('windowHours', new DefaultValuePipe(24), ParseIntPipe) windowHours: number,
    @Query('intervals') intervals?: string,
  ) {
    return this.marketReadModelReconciliationService.getProjectionHealth(
      windowHours,
      this.parseIntervals(intervals),
    );
  }

  @Get('lag')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MARKET_READ_MODEL_OBSERVE)
  @ApiOperation({
    summary: 'Projection lag summary (admin only)',
    description:
      'Returns only lag measurements for trades, tickers, and OHLCV projections. Use for rapid lag monitoring without full reconciliation details.',
  })
  async getProjectionLag() {
    return this.marketReadModelReconciliationService.getProjectionLagSummary();
  }

  private parseIntervals(raw?: string): number[] | undefined {
    if (!raw?.trim()) return undefined;
    const values = raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    return values.length > 0 ? values : undefined;
  }
}
