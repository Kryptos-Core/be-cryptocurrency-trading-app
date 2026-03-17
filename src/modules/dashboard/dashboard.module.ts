import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MarketsModule } from '@/modules/markets/markets.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';

/**
 * Dashboard Module
 * Imports MarketsModule (MarketsService) and WalletsModule (WalletRepository).
 * RedisService is globally available via @Global() RedisModule — no explicit import needed.
 */
@Module({
  imports: [MarketsModule, WalletsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
