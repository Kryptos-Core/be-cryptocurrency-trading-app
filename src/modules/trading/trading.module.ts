import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MarketsModule } from '@/modules/markets/markets.module';
import { BinancePriceFeedService } from './services/binance-price-feed.service';
import { DashboardBroadcastService } from './services/dashboard-broadcast.service';
import { TradingPriceStreamService } from './services/trading-price-stream.service';
import { TradingSubscriptionService } from './services/trading-subscription.service';
import { WorkspaceService } from './services/workspace.service';
import { TradingGateway } from './websocket/trading.gateway';

@Module({
  imports: [
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
  providers: [
    TradingGateway,
    TradingSubscriptionService,
    TradingPriceStreamService,
    BinancePriceFeedService,
    DashboardBroadcastService,
    WorkspaceService,
  ],
  exports: [TradingPriceStreamService, BinancePriceFeedService],
})
export class TradingModule {}
