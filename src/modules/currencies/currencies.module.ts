import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Currency } from '@/entities/currency.entity';
import { MarketsModule } from '@/modules/markets/markets.module';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { CurrencyRepository } from './repositories';

/**
 * Currencies Module
 * Module Pattern: Encapsulate currencies feature
 * Dependency Injection: Register providers and exports
 */
@Module({
  imports: [TypeOrmModule.forFeature([Currency]), forwardRef(() => MarketsModule)],
  providers: [CurrenciesService, CurrencyRepository],
  controllers: [CurrenciesController],
  exports: [CurrenciesService, CurrencyRepository], // Export for use in other modules
})
export class CurrenciesModule {}
