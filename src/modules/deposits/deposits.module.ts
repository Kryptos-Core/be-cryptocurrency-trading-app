import { Module } from '@nestjs/common';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { PaymentConfigModule } from '@/modules/payment-config/payment-config.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { GetDepositPreviewQuery, GetDepositsQuery } from './application/queries';
import {
  CreateDepositLinkUseCase,
  HandleDepositWebhookUseCase,
  SyncDepositStatusUseCase,
} from './application/use-cases';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';
import { FIAT_DEPOSIT_REPOSITORY } from './domain/ports';
import { PayosRedirectController } from './payos-redirect.controller';
import { FiatDepositRepository } from './repositories/fiat-deposit.repository';

/**
 * Deposits Module — Clean Architecture.
 *
 * Layer structure:
 * domain/ — ports (FiatDepositRepositoryPort)
 * application/ — use-cases + queries (orchestration, no ORM imports)
 * repositories/ — TypeORM implementation (TODO: move to infrastructure/persistence/)
 * presentation/ — controllers + DTOs
 *
 * Note: DepositsService encapsulates PayOS SDK logic; use-cases delegate to it
 * until Phase 4.2 fully decomposes the service into atomic use-cases.
 */
@Module({
  imports: [WalletsModule, CurrenciesModule, PaymentConfigModule],
  controllers: [DepositsController, PayosRedirectController],
  providers: [
    FiatDepositRepository,
    {
      provide: FIAT_DEPOSIT_REPOSITORY,
      useExisting: FiatDepositRepository,
    },
    DepositsService,
    // Use-cases
    CreateDepositLinkUseCase,
    HandleDepositWebhookUseCase,
    SyncDepositStatusUseCase,
    // Queries
    GetDepositsQuery,
    GetDepositPreviewQuery,
  ],
  exports: [DepositsService],
})
export class DepositsModule {}
