import { Module } from '@nestjs/common';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { MarketsModule } from '@/modules/markets/markets.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { BinanceExchangeService } from './binance/binance.service';
import { ExchangeController } from './exchange.controller';
import { ExchangeService } from './exchange.service';
import { ExchangeInfoSyncService } from './exchange-info-sync.service';
import { MarketCatalogBootstrapService } from './market-catalog-bootstrap.service';
import { MockExchangeService } from './mock/mock-exchange.service';

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
