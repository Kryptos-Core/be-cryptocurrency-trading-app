import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrenciesService } from './currencies.service';
import { CurrenciesController } from './currencies.controller';
import { CurrencyRepository } from './repositories';
import { Currency } from '@/entities/currency.entity';

/**
 * Currencies Module
 * Module Pattern: Encapsulate currencies feature
 * Dependency Injection: Register providers and exports
 */
@Module({
  imports: [TypeOrmModule.forFeature([Currency])],
  providers: [CurrenciesService, CurrencyRepository],
  controllers: [CurrenciesController],
  exports: [CurrenciesService, CurrencyRepository], // Export for use in other modules
})
export class CurrenciesModule {}
