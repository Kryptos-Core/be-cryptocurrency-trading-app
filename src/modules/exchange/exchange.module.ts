import { Module } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { ExchangeController } from './exchange.controller';
import { ExchangeInfoSyncService } from './exchange-info-sync.service';
import { BinanceExchangeService } from './binance/binance.service';
import { MockExchangeService } from './mock/mock-exchange.service';
import { MarketCatalogBootstrapService } from './market-catalog-bootstrap.service';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { MarketsModule } from '@/modules/markets/markets.module';
import { RedisModule } from '@/modules/redis/redis.module';

/**
 * Exchange Module
 * Provides exchange integration (Binance, Mock, etc.)
 * and sync of currencies/market pairs from Binance exchangeInfo.
 */
@Module({
  imports: [RedisModule, CurrenciesModule, MarketsModule],
  controllers: [ExchangeController],
  providers: [
    ExchangeService,
    ExchangeInfoSyncService,
    MarketCatalogBootstrapService,
    BinanceExchangeService,
    MockExchangeService,
  ],
  exports: [ExchangeService, ExchangeInfoSyncService],
})
export class ExchangeModule {}
