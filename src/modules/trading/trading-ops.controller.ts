import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { GoRolloutReadinessService } from './services/go-rollout-readiness.service';
import { PublicWsPayloadParityService } from './services/public-ws-payload-parity.service';

@ApiTags('trading-admin')
@ApiBearerAuth('JWT-auth')
@Controller('trading/admin')
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
export class TradingOpsController {
  constructor(
    private readonly payloadParityService: PublicWsPayloadParityService,
    private readonly goRolloutReadinessService: GoRolloutReadinessService,
  ) {}

  @Get('public-ws-parity')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MARKET_READ_MODEL_OBSERVE)
  @ApiOperation({
    summary: 'Public WS payload parity report',
    description:
      'Returns contract compatibility health for ticker/ohlc payloads and drift summary between Go aggregator ingress payloads and emitted /trading payloads.',
  })
  getPublicWsParity() {
    return this.payloadParityService.getReport();
  }

  @Get('go-rollout-readiness')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MATCHING_SHADOW_OBSERVE, Permission.MARKET_READ_MODEL_OBSERVE)
  @ApiOperation({
    summary: 'Go rollout readiness summary',
    description:
      'Aggregates market read-model health, public WS parity, and matching shadow thresholds into a single readiness decision.',
  })
  async getGoRolloutReadiness() {
    return this.goRolloutReadinessService.getReadiness();
  }

  @Get('go-rollout-readiness/snapshots')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MATCHING_SHADOW_OBSERVE, Permission.MARKET_READ_MODEL_OBSERVE)
  @ApiOperation({
    summary: 'List Go rollout readiness snapshots',
    description: 'Returns recent persisted readiness snapshots for rollout audit.',
  })
  async getGoRolloutReadinessSnapshots(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.goRolloutReadinessService.listSnapshots(limit);
  }

  @Get('go-rollout-readiness/snapshots/latest')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MATCHING_SHADOW_OBSERVE, Permission.MARKET_READ_MODEL_OBSERVE)
  @ApiOperation({
    summary: 'Latest Go rollout readiness snapshot',
    description: 'Returns the latest persisted readiness snapshot, if any.',
  })
  async getLatestGoRolloutReadinessSnapshot() {
    return this.goRolloutReadinessService.getLatestSnapshot();
  }

  @Post('go-rollout-readiness/snapshot')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MATCHING_SHADOW_OBSERVE, Permission.MARKET_READ_MODEL_OBSERVE)
  @ApiOperation({
    summary: 'Persist Go rollout readiness snapshot',
    description:
      'Stores a timestamped readiness report under reports/go-rollout for rollout audit and acceptance evidence.',
  })
  async snapshotGoRolloutReadiness(@CurrentUser('userId') userId?: string) {
    return this.goRolloutReadinessService.snapshotReadiness(userId ?? 'unknown');
  }

  @Get('go-rollout-readiness/rollback-drills')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MATCHING_SHADOW_OBSERVE, Permission.MARKET_READ_MODEL_OBSERVE)
  @ApiOperation({
    summary: 'List rollback drill records',
    description: 'Returns recent rollback drill evidence for Phase 5 rollback readiness.',
  })
  async getRollbackDrills(@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number) {
    return this.goRolloutReadinessService.listRollbackDrills(limit);
  }

  @Get('go-rollout-readiness/rollback-drills/latest')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MATCHING_SHADOW_OBSERVE, Permission.MARKET_READ_MODEL_OBSERVE)
  @ApiOperation({
    summary: 'Latest rollback drill record',
    description: 'Returns latest rollback drill used by readiness parity gate.',
  })
  async getLatestRollbackDrill() {
    return this.goRolloutReadinessService.getLatestRollbackDrill();
  }

  @Post('go-rollout-readiness/rollback-drills')
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MATCHING_SHADOW_OBSERVE, Permission.MARKET_READ_MODEL_OBSERVE)
  @ApiOperation({
    summary: 'Record rollback drill evidence',
    description:
      'Persists a rollback drill record (typically go_aggregator -> nestjs) for Phase 5 acceptance gate.',
  })
  async recordRollbackDrill(
    @CurrentUser('userId') userId?: string,
    @Body('fromSource') fromSource?: string,
    @Body('toSource') toSource?: string,
    @Body('success', new ParseBoolPipe({ optional: true })) success?: boolean,
    @Body('notes') notes?: string,
  ) {
    return this.goRolloutReadinessService.recordRollbackDrill({
      actorUserId: userId ?? 'unknown',
      fromSource: fromSource ?? 'go_aggregator',
      toSource: toSource ?? 'nestjs',
      success: success ?? true,
      notes,
    });
  }
}
