import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { getTypeOrmConfig } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { JwtAuthGuard } from './common/guards';

/**
 * App Module - Root Module
 * Áp dụng: Module Pattern & Dependency Injection
 */
@Module({
  imports: [
    // Global Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),

    // Feature Modules
    AuthModule,
    UsersModule,
  ],
  providers: [
    // Global JWT Guard - Apply to all routes except @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
