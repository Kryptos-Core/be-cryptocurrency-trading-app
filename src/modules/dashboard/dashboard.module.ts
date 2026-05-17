import { forwardRef, Module } from '@nestjs/common';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { MarketsModule } from '@/modules/markets/markets.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { GetDashboardSummaryQuery } from './application/queries/get-dashboard-summary.query';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard Module
 * Imports MarketsModule (MarketsService) and WalletsModule (WalletRepository).
 * RedisService is globally available via @Global() RedisModule — no explicit import needed.
 */
@Module({
  imports: [forwardRef(() => CurrenciesModule), forwardRef(() => MarketsModule), forwardRef(() => WalletsModule)],
  controllers: [DashboardController],
  providers: [DashboardService, GetDashboardSummaryQuery],
})
export class DashboardModule {}
