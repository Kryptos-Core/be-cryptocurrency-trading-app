import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getTypeOrmConfig } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { MarketsModule } from './modules/markets/markets.module';
import { RedisModule } from './modules/redis/redis.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { validateEnvironment } from './config/env.validation';
import appConfig from './config/app.config';

@Module({
  imports: [
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
  ],
})
export class AppModule {}
