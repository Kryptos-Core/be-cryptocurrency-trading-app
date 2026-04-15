import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Currency } from '@/entities/currency.entity';
import { MarketsModule } from '@/modules/markets/markets.module';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { CURRENCY_REPOSITORY } from './domain/ports';
import { CurrencyRepository } from './infrastructure/persistence/currency.repository';

/**
 * Currencies Module
 * Module Pattern: Encapsulate currencies feature
 * Dependency Injection: Register providers and exports
 */
@Module({
  imports: [TypeOrmModule.forFeature([Currency]), forwardRef(() => MarketsModule)],
  providers: [
    CurrenciesService,
    CurrencyRepository,
    // Port → Adapter binding
    { provide: CURRENCY_REPOSITORY, useExisting: CurrencyRepository },
  ],
  controllers: [CurrenciesController],
  exports: [CurrenciesService, CurrencyRepository, CURRENCY_REPOSITORY],
})
export class CurrenciesModule {}
