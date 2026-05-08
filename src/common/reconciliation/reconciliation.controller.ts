import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequirePermissions, RequireRoles } from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { ReconciliationService } from './reconciliation.service';

/**
 * Reconciliation Admin Controller
 *
 * Phase 10: Reconciliation Jobs
 *
 * Exposes reconciliation results and triggers for ops monitoring.
 */
@ApiTags('reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@Controller('admin/reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('summary')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.OUTBOX_MANAGE)
  @ApiOperation({
    summary: 'Get full reconciliation summary',
    description: 'Returns reconciliation status for all checks: balances, trades, outbox, orderbook, OHLCV.',
  })
  @ApiQuery({ name: 'windowMinutes', required: false, type: Number, example: 5 })
  async getSummary(
    @Query('windowMinutes', new DefaultValuePipe(5), ParseIntPipe) windowMinutes: number,
  ) {
    return this.reconciliationService.getReconciliationSummary(windowMinutes);
  }

  @Get('balances')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.OUTBOX_MANAGE)
  @ApiOperation({
    summary: 'Check wallet balance vs ledger drift',
    description: 'Detects any balance drift between stated wallet balance and ledger.',
  })
  async reconcileBalances() {
    return this.reconciliationService.reconcileBalances();
  }

  @Get('trades')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.OUTBOX_MANAGE)
  @ApiOperation({
    summary: 'Check trades count match',
    description: 'Compares trade count between PostgreSQL and read model.',
  })
  @ApiQuery({ name: 'windowMinutes', required: false, type: Number, example: 5 })
  async reconcileTrades(
    @Query('windowMinutes', new DefaultValuePipe(5), ParseIntPipe) windowMinutes: number,
  ) {
    return this.reconciliationService.reconcileTrades(windowMinutes);
  }

  @Get('outbox-kafka')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.OUTBOX_MANAGE)
  @ApiOperation({
    summary: 'Check outbox unpublished backlog and DLQ',
    description: 'Returns unpublished event count and dead-letter count.',
  })
  async reconcileOutboxKafka() {
    return this.reconciliationService.reconcileOutboxVsKafka();
  }

  @Get('orderbook')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.OUTBOX_MANAGE)
  @ApiOperation({
    summary: 'Check orderbook checksum',
    description: 'Compares orderbook totals between PostgreSQL and Redis.',
  })
  async reconcileOrderbook() {
    return this.reconciliationService.reconcileOrderbook();
  }

  @Get('ohlcv')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.OUTBOX_MANAGE)
  @ApiOperation({
    summary: 'Check OHLCV volume consistency',
    description: 'Compares OHLCV volumes between PostgreSQL and read model.',
  })
  @ApiQuery({ name: 'windowMinutes', required: false, type: Number, example: 60 })
  async reconcileOhlcv(
    @Query('windowMinutes', new DefaultValuePipe(60), ParseIntPipe) windowMinutes: number,
  ) {
    return this.reconciliationService.reconcileOhlcv(windowMinutes);
  }
}
