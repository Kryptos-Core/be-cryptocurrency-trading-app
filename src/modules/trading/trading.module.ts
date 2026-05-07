import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { OutboxModule } from '@/common/outbox/outbox.module';
import { MarketsModule } from '@/modules/markets/markets.module';
import { GetWorkspaceStateQuery } from './application/queries/get-workspace-state.query';
import { BinancePriceFeedService } from './services/binance-price-feed.service';
import { DashboardBroadcastService } from './services/dashboard-broadcast.service';
import { GoAggregatorPriceFeedService } from './services/go-aggregator-price-feed.service';
import { GoRolloutReadinessService } from './services/go-rollout-readiness.service';
import { PublicWsPayloadParityService } from './services/public-ws-payload-parity.service';
import { TradingPriceStreamService } from './services/trading-price-stream.service';
import { TradingPublicWsMetricsCollectorService } from './services/trading-public-ws-metrics-collector.service';
import { TradingSubscriptionService } from './services/trading-subscription.service';
import { WorkspaceService } from './services/workspace.service';
import { TradingOpsController } from './trading-ops.controller';
import { TradingGateway } from './websocket/trading.gateway';

@Module({
  imports: [
    OutboxModule,
    MarketsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '86400s' },
      }),
    }),
  ],
  controllers: [TradingOpsController],
  providers: [
    TradingGateway,
    TradingSubscriptionService,
    TradingPriceStreamService,
    BinancePriceFeedService,
    GoAggregatorPriceFeedService,
    PublicWsPayloadParityService,
    GoRolloutReadinessService,
    TradingPublicWsMetricsCollectorService,
    DashboardBroadcastService,
    WorkspaceService,
    GetWorkspaceStateQuery,
  ],
  exports: [TradingPriceStreamService, BinancePriceFeedService],
})
export class TradingModule {}
