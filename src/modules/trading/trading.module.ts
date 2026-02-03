import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TradingGateway } from './websocket/trading.gateway';
import { TradingSubscriptionService } from './services/trading-subscription.service';
import { TradingPriceStreamService } from './services/trading-price-stream.service';
import { BinancePriceFeedService } from './services/binance-price-feed.service';
import { MarketsModule } from '@/modules/markets/markets.module';

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
  ],
  exports: [TradingPriceStreamService, BinancePriceFeedService],
})
export class TradingModule {}
