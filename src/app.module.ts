import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { getTypeOrmConfig } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

import { CurrenciesModule } from './modules/currencies/currencies.module';
import { MarketsModule } from './modules/markets/markets.module';
import { RedisModule } from './modules/redis/redis.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { OrdersModule } from './modules/orders/orders.module';
import { MatchingModule } from './modules/matching/matching.module';
import { TradingModule } from './modules/trading/trading.module';
import { ExchangeModule } from './modules/exchange/exchange.module';
import { BlockchainModule } from './modules/blockchain/blockchain.module';
import { DepositsModule } from './modules/deposits/deposits.module';
import { ManagedWalletsModule } from './modules/managed-wallets/managed-wallets.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { validateEnvironment } from './config/env.validation';
import appConfig from './config/app.config';

@Module({
  imports: [
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
  ],
})
export class AppModule {}
