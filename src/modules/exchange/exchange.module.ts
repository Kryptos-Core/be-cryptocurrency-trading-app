import { Module } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { BinanceExchangeService } from './binance/binance.service';
import { MockExchangeService } from './mock/mock-exchange.service';

/**
 * Exchange Module
 * Provides exchange integration (Binance, Mock, etc.)
 */
@Module({
  providers: [
    ExchangeService,
    BinanceExchangeService,
    MockExchangeService,
  ],
  exports: [ExchangeService],
})
export class ExchangeModule {}
