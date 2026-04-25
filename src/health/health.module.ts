import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxModule } from '@/common/outbox/outbox.module';
import { MarketsModule } from '@/modules/markets/markets.module';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, TypeOrmModule, OutboxModule, MarketsModule],
  controllers: [HealthController],
})
export class HealthModule {}
