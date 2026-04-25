import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxModule } from '@/common/outbox/outbox.module';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, TypeOrmModule, OutboxModule],
  controllers: [HealthController],
})
export class HealthModule {}
