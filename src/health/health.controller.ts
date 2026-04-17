import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { Public } from '@/common/decorators';
import { RedisService } from '@/common/services/redis.service';

/**
 * Health check endpoint — returns component health for DB and infrastructure.
 *
 * GET /api/v1/health         — liveness (always 200 if process is up)
 * GET /api/v1/health/ready   — readiness (DB + dependent services up)
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
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
    return this.health.check([
      () => this.db.pingCheck('database', { connection: this.dataSource }),
      async () => {
        const pong = await this.redisService.getClient().ping();
        if (pong !== 'PONG') {
          throw new Error(`Redis ping unexpected: ${String(pong)}`);
        }
        return { redis: { status: 'up' as const } };
      },
    ]);
  }
}
