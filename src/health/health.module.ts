import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';

/**
 * HealthModule — provides liveness and readiness endpoints.
 *
 * Endpoints:
 *   GET /api/v1/health        — liveness (process up)
 *   GET /api/v1/health/ready  — readiness (DB, Redis, queue health)
 */
@Module({
  imports: [TerminusModule, TypeOrmModule],
  controllers: [HealthController],
})
export class HealthModule {}
