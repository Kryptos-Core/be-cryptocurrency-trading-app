import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimescaleBenchmarkService } from './timescale-benchmark.service';
import { ReadMarketOhlcv } from '@/entities/read-market-ohlcv.entity';

/**
 * TimescaleDB Module
 *
 * Phase 9: TimescaleDB optimization
 *
 * Provides TimescaleDB benchmark service to compare PostgreSQL vs TimescaleDB
 * for OHLCV data. Includes:
 * - Benchmark service for performance comparison
 * - Hypertable conversion utilities
 * - Continuous aggregate management
 */
@Module({
  imports: [TypeOrmModule.forFeature([ReadMarketOhlcv])],
  providers: [TimescaleBenchmarkService],
  exports: [TimescaleBenchmarkService],
})
export class TimescaleModule {}
