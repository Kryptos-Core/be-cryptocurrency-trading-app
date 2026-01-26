import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketsService } from './markets.service';
import { MarketsController } from './markets.controller';
import { MarketRepository } from './repositories';
import { MarketPair } from '@/entities/market-pair.entity';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';

/**
 * Markets Module
 * Module Pattern: Encapsulate markets feature
 * Dependency Injection: Register providers and exports
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MarketPair]),
    CurrenciesModule, // Import to use CurrenciesService for validation
  ],
  providers: [MarketsService, MarketRepository],
  controllers: [MarketsController],
  exports: [MarketsService, MarketRepository], // Export for use in other modules
})
export class MarketsModule {}
