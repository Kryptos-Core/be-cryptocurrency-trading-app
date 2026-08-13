import { BullModule, type BullRootModuleOptions } from '@nestjs/bull';
import { Injectable, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { NextFunction, Request, Response } from 'express';
import { ApplicationBusModule } from './common/application-bus/application-bus.module';
import { BullBoardModule } from './common/bull-board/bull-board.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { I18nModule } from './common/i18n';
import { OutboxModule } from './common/outbox/outbox.module';
import { UnitOfWorkModule } from './common/unit-of-work/unit-of-work.module';
import appConfig from './config/app.config';
import { DatabaseProvidersModule } from './config/database.module';
import { validateEnvironment } from './config/env.validation';
import { nestEnvFilePaths } from './config/load-env-files';
import { getBullRedisConfig } from './config/redis.config';
import { getTypeOrmConfig } from './config/typeorm.config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { BinanceRestModule } from './modules/binance-rest/binance-rest.module';
import { BinanceProxyModule } from './modules/binance-proxy/binance-proxy.module';
import { UserBinanceCredentialsModule } from './modules/user-binance-credentials/user-binance-credentials.module';
import { BlockchainModule } from './modules/blockchain/blockchain.module';
import { BlockchainDepositWatcherModule } from './modules/blockchain/deposit-watcher/blockchain-deposit-watcher.module';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DepositsModule } from './modules/deposits/deposits.module';
import { ExchangeModule } from './modules/exchange/exchange.module';
import { ExchangeRateModule } from './modules/exchange-rate/exchange-rate.module';
import { ManagedWalletsModule } from './modules/managed-wallets/managed-wallets.module';
import { MarketMakerModule } from './modules/market-maker/market-maker.module';
import { MarketsModule } from './modules/markets/markets.module';
import { MatchingModule } from './modules/matching/matching.module';
import { MetadataModule } from './modules/metadata/metadata.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentConfigModule } from './modules/payment-config/payment-config.module';
import { ReconciliationModule } from './common/reconciliation/reconciliation.module';
import { RedisModule } from './modules/redis/redis.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { TradingModule } from './modules/trading/trading.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { TreasuryE2EConfigModule } from './modules/treasury-e2e-config/treasury-e2e-config.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { TelemetryModule } from './telemetry';

/**
 * Express middleware that protects Bull Board at `/admin/queues` with JWT + ADMIN role.
 * Mounted before BullBoardService's router — rejects non-admin requests with 403.
 */
@Injectable()
class BullBoardAuthMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: Request & { user?: unknown }, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(403).json({ statusCode: 403, message: 'Unauthorized' });
      return;
    }

    try {
      const token = authHeader.slice(7);
      const payload = this.jwtService.verify(token);
      if (payload.role !== 'ADMIN') {
        res.status(403).json({ statusCode: 403, message: 'Forbidden — ADMIN role required' });
        return;
      }
      // Attach user so Bull Board UI can show who is logged in
      req.user = payload;
      next();
    } catch {
      res.status(403).json({ statusCode: 403, message: 'Invalid or expired token' });
    }
  }
}

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
    I18nModule, // Global i18n service for email templates
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): BullRootModuleOptions => ({
        redis: getBullRedisConfig(config),
      }),
    }),
    TelemetryModule,
    RedisModule,
    ApplicationBusModule,
    UnitOfWorkModule,
    OutboxModule,
    BullBoardModule, // mounts Bull Board UI at /admin/queues (admin-only)
    BinanceRestModule,
    BinanceProxyModule,
    UserBinanceCredentialsModule,
    AuthModule,
    AiAssistantModule,
    UsersModule,
    CurrenciesModule,
    MarketsModule,
    WalletsModule,
    OrdersModule,
    MatchingModule,
    TradingModule,
    ExchangeModule,
    ExchangeRateModule,
    BlockchainModule,
    BlockchainDepositWatcherModule,
    DepositsModule,
    ManagedWalletsModule,
    DashboardModule,
    HealthModule,
    NotificationsModule,
    MarketMakerModule,
    PaymentConfigModule,
    ReconciliationModule,
    TreasuryModule,
    TreasuryE2EConfigModule,
    SystemConfigModule,
    MetadataModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Global correlation ID middleware
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');

    // Bull Board admin auth — protect /admin/queues with JWT + ADMIN role check
    // BullBoardService mounts the UI at this path during onApplicationBootstrap.
    // This middleware runs before the BullBoardService router, rejecting non-admin requests.
    consumer.apply(BullBoardAuthMiddleware).forRoutes('/admin/queues');
  }
}
