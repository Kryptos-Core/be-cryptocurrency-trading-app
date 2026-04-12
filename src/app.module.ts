import { BullModule, type BullRootModuleOptions } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import { validateEnvironment } from './config/env.validation';
import { nestEnvFilePaths } from './config/load-env-files';
import { getTypeOrmConfig } from './config/typeorm.config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { BlockchainModule } from './modules/blockchain/blockchain.module';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DepositsModule } from './modules/deposits/deposits.module';
import { ExchangeModule } from './modules/exchange/exchange.module';
import { ManagedWalletsModule } from './modules/managed-wallets/managed-wallets.module';
import { MarketMakerModule } from './modules/market-maker/market-maker.module';
import { MarketsModule } from './modules/markets/markets.module';
import { MatchingModule } from './modules/matching/matching.module';
import { MetadataModule } from './modules/metadata/metadata.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentConfigModule } from './modules/payment-config/payment-config.module';
import { RedisModule } from './modules/redis/redis.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { TradingModule } from './modules/trading/trading.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';

@Module({
  imports: [
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    ScheduleModule.forRoot(), // enables @Cron / @Interval decorators
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: nestEnvFilePaths(),
      validate: validateEnvironment, // Validate environment variables
      validationOptions: {
        allowUnknown: true, // Allow unknown env vars (system variables)
        abortEarly: false, // Show all validation errors at once
      },
      load: [appConfig], // Load app config namespace
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): BullRootModuleOptions => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
          db: config.get<number>('REDIS_DB', 0),
        },
      }),
    }),
    RedisModule,
    AuthModule,
    UsersModule,
    CurrenciesModule,
    MarketsModule,
    WalletsModule,
    OrdersModule,
    MatchingModule,
    TradingModule,
    ExchangeModule,
    BlockchainModule,
    DepositsModule,
    ManagedWalletsModule,
    DashboardModule,
    HealthModule,
    NotificationsModule,
    MarketMakerModule,
    PaymentConfigModule,
    TreasuryModule,
    SystemConfigModule,
    MetadataModule,
  ],
})
export class AppModule {}
