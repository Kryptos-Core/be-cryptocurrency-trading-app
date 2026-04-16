import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Currency } from '@/entities/currency.entity';
import { MarketsModule } from '@/modules/markets/markets.module';
import { GetCurrenciesQuery, GetCurrencyByIdQuery } from './application/queries';
import {
  CreateCurrencyUseCase,
  DeleteCurrencyUseCase,
  UpdateCurrencyUseCase,
} from './application/use-cases';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { CURRENCY_REPOSITORY } from './domain/ports';
import { CurrencyRepository } from './infrastructure/persistence/currency.repository';

/**
 * Currencies Module — Clean Architecture.
 *
 * Layer structure:
 * domain/ — ports (CurrencyRepositoryPort)
 * application/ — use-cases + queries (pure business logic, no infrastructure deps)
 * infrastructure/persistence/ — TypeORM implementation of ports
 * presentation/ — controllers + DTOs (here: currencies.controller.ts)
 */
@Module({
  imports: [TypeOrmModule.forFeature([Currency]), forwardRef(() => MarketsModule)],
  providers: [
    CurrenciesService,
    CurrencyRepository,
    // Port → Adapter binding
    { provide: CURRENCY_REPOSITORY, useExisting: CurrencyRepository },
    // Use-cases
    CreateCurrencyUseCase,
    UpdateCurrencyUseCase,
    DeleteCurrencyUseCase,
    // Queries
    GetCurrenciesQuery,
    GetCurrencyByIdQuery,
  ],
  controllers: [CurrenciesController],
  exports: [CurrenciesService, CurrencyRepository, CURRENCY_REPOSITORY],
})
export class CurrenciesModule {}
