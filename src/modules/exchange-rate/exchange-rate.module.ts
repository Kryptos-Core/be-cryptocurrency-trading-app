import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeRateAuditLog } from '@/entities/exchange-rate-audit-log.entity';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { DepositsModule } from '@/modules/deposits/deposits.module';
import { PaymentConfigModule } from '@/modules/payment-config/payment-config.module';
import { UsersModule } from '@/modules/users/users.module';
import { ExchangeRateAutoSyncScheduler } from './exchange-rate-auto-sync.scheduler';
import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateService } from './exchange-rate.service';
import { CoinGeckoProvider } from './providers/coingecko.provider';
import { FiatRateProvider } from './providers/fiat-rate.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRateAuditLog]),
    CurrenciesModule,
    DepositsModule,
    PaymentConfigModule,
    UsersModule,
  ],
  controllers: [ExchangeRateController],
  providers: [
    ExchangeRateService,
    ExchangeRateAutoSyncScheduler,
    CoinGeckoProvider,
    FiatRateProvider,
  ],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
