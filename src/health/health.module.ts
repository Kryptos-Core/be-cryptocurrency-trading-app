import { forwardRef, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxModule } from '@/common/outbox/outbox.module';
import { MarketsModule } from '@/modules/markets/markets.module';
import { TradingModule } from '@/modules/trading/trading.module';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, TypeOrmModule, forwardRef(() => OutboxModule), forwardRef(() => MarketsModule), forwardRef(() => TradingModule)],
  controllers: [HealthController],
})
export class HealthModule {}
