import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailService } from '@/common/services';
import { User } from '@/entities/user.entity';
import { PASSWORD_HASHER } from '@/modules/auth/application/ports/password-hasher.token';
import { TOKEN_ISSUER } from '@/modules/auth/application/ports/token-issuer.token';
import { ChangePasswordUseCase } from '@/modules/auth/application/use-cases/change-password.use-case';
import { LoginWithPasswordUseCase } from '@/modules/auth/application/use-cases/login-with-password.use-case';
import { RegisterUserUseCase } from '@/modules/auth/application/use-cases/register-user.use-case';
import { AUTH_REPOSITORY } from '@/modules/auth/domain/ports';
import { AuthRepositoryImpl } from '@/modules/auth/infrastructure/persistence';
import { BcryptPasswordHasherAdapter } from '@/modules/auth/infrastructure/providers/bcrypt-password-hasher.adapter';
import { JwtTokenIssuerAdapter } from '@/modules/auth/infrastructure/providers/jwt-token-issuer.adapter';
import { BlockchainModule } from '@/modules/blockchain/blockchain.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { UsersModule } from '@/modules/users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies';
import { TwoFaService } from './two-fa.service';
import { WalletAuthService } from './wallet-auth.service';
import { WalletConnectAuthService } from './wallet-connect-auth.service';

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
          expiresIn: String(configService.get('JWT_EXPIRATION') || '24h'),
        },
      }),
    }),
    TypeOrmModule.forFeature([User]),
    forwardRef(() => BlockchainModule),
    forwardRef(() => UsersModule),
    forwardRef(() => SystemConfigModule),
  ],
  providers: [
    AuthService,
    WalletAuthService,
    WalletConnectAuthService,
    TwoFaService,
    JwtStrategy,
    MailService,
    RegisterUserUseCase,
    LoginWithPasswordUseCase,
    ChangePasswordUseCase,
    BcryptPasswordHasherAdapter,
    {
      provide: PASSWORD_HASHER,
      useExisting: BcryptPasswordHasherAdapter,
    },
    JwtTokenIssuerAdapter,
    {
      provide: TOKEN_ISSUER,
      useExisting: JwtTokenIssuerAdapter,
    },
    AuthRepositoryImpl,
    {
      provide: AUTH_REPOSITORY,
      useExisting: AuthRepositoryImpl,
    },
  ],
  controllers: [AuthController],
  exports: [AuthService, AUTH_REPOSITORY, TwoFaService, JwtModule, MailService, TOKEN_ISSUER],
})
export class AuthModule {}
