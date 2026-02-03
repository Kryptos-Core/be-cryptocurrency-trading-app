import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TradingGateway } from './websocket/trading.gateway';
import { TradingSubscriptionService } from './services/trading-subscription.service';
import { TradingPriceStreamService } from './services/trading-price-stream.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '86400s' },
    }),
  ],
  providers: [
    TradingGateway,
    TradingSubscriptionService,
    TradingPriceStreamService,
  ],
  exports: [TradingPriceStreamService],
})
export class TradingModule {}
