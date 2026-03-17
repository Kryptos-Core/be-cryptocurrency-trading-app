import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { WalletAuthService } from './wallet-auth.service';
import { AuthRepository } from './repositories';
import { JwtStrategy } from './strategies';
import { User } from '@/entities/user.entity';
import { BlockchainModule } from '@/modules/blockchain/blockchain.module';

/**
 * Auth Module
 * Quản lý authentication & authorization (email + wallet)
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get('JWT_EXPIRATION') || '24h') as any,
        },
      }),
    }),
    TypeOrmModule.forFeature([User]),
    BlockchainModule,
  ],
  providers: [AuthService, WalletAuthService, AuthRepository, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, AuthRepository, JwtModule],
})
export class AuthModule {}
