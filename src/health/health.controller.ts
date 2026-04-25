import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { Public } from '@/common/decorators';
import { OutboxAdminService } from '@/common/outbox/outbox-admin.service';
import { RedisService } from '@/common/services/redis.service';
import { ANALYTICS_DB, MARKET_TS_DB } from '@/config';
import { MarketReadModelReconciliationService } from '@/modules/markets/market-read-model-reconciliation.service';
import { PublicWsPayloadParityService } from '@/modules/trading/services/public-ws-payload-parity.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    @Optional() @Inject(MARKET_TS_DB) private readonly marketTsDb: DataSource | null = null,
    @Optional() @Inject(ANALYTICS_DB) private readonly analyticsDb: Record<string, unknown> | null = null,
    private readonly outboxAdminService: OutboxAdminService,
    @Optional()
    private readonly marketReadModelReconciliationService?: MarketReadModelReconciliationService,
    @Optional()
    private readonly publicWsPayloadParityService?: PublicWsPayloadParityService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Liveness check',
    description: 'Returns 200 if the API process is running.',
  })
  @ApiResponse({ status: 200, description: 'API is running' })
  liveness() {
    return { ok: true, timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness check',
    description: 'Returns 200 if DB and critical dependencies are healthy.',
  })
  @ApiResponse({ status: 200, description: 'All dependencies healthy' })
  @ApiResponse({ status: 503, description: 'One or more dependencies unhealthy' })
  readiness() {
    const checks: Array<() => Promise<HealthIndicatorResult>> = [
      async () => this.db.pingCheck('database', { connection: this.dataSource }),
      async () => {
        const pong = await this.redisService.getClient().ping();
        if (pong !== 'PONG') {
          throw new Error(`Redis ping unexpected: ${String(pong)}`);
        }
        return { redis: { status: 'up' as const } };
      },
      async () => {
        const outbox = await this.outboxAdminService.getRelayHealth();
        return {
          outbox_relay: {
            status: 'up' as const,
            ...outbox,
          },
        };
      },
    ];

    if (this.marketTsDb) {
      checks.push(async () => this.db.pingCheck('market_ts_db', { connection: this.marketTsDb }));
    }

    const marketReadModelReconciliationService = this.marketReadModelReconciliationService;
    if (marketReadModelReconciliationService) {
      checks.push(async () => {
        const report = await marketReadModelReconciliationService.getProjectionHealth(24);
        const { status: projectionStatus, ...details } = report;
        return {
          market_read_model: {
            status: 'up' as const,
            projection_status: projectionStatus,
            degraded: projectionStatus !== 'up',
            ...details,
          },
        };
      });
    }

    const publicWsPayloadParityService = this.publicWsPayloadParityService;
    if (publicWsPayloadParityService) {
      checks.push(async () => {
        const report = publicWsPayloadParityService.getReport();
        const contractValid = report.ticker.contractValid && report.ohlc.contractValid;
        const degraded = !contractValid || report.goAggregatorParity.driftPairs > 0;

        return {
          market_public_ws: {
            status: 'up' as const,
            source: report.source,
            degraded,
            contract_valid: contractValid,
            parity: report.goAggregatorParity,
          },
        };
      });
    }

    if (this.analyticsDb) {
      checks.push(async () => ({ analytics_db: { status: 'up' as const } }));
    }

    return this.health.check(checks);
  }
}
