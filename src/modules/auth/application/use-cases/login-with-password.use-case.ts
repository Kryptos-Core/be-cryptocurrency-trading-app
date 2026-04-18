import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessException, UnauthorizedException } from '@/common/exceptions';
import { runInSpan } from '@/common/telemetry';
import type { PasswordHasherPort } from '@/modules/auth/application/ports/password-hasher.port';
import { PASSWORD_HASHER } from '@/modules/auth/application/ports/password-hasher.token';
import type { TokenIssuerPort } from '@/modules/auth/application/ports/token-issuer.port';
import { TOKEN_ISSUER } from '@/modules/auth/application/ports/token-issuer.token';
import type { LoginDto } from '@/modules/auth/dto';
import type { UserRecord } from '@/modules/users';
import { USERS_REPOSITORY, type UsersRepositoryPort } from '@/modules/users/domain/ports';
import { buildAuthAccessTokenPayload, sanitizeAuthUser } from './shared/auth-response.util';

@Injectable()
export class LoginWithPasswordUseCase {
  private readonly logger = new Logger(LoginWithPasswordUseCase.name);

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
    @Inject(TOKEN_ISSUER)
    private readonly tokenIssuer: TokenIssuerPort,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(loginDto: LoginDto): Promise<{ accessToken: string; user: Partial<UserRecord> }> {
    return runInSpan('Auth.LoginWithPassword', async () => this.executeImpl(loginDto), {
      module: 'auth',
    });
  }

  private async executeImpl(
    loginDto: LoginDto,
  ): Promise<{ accessToken: string; user: Partial<UserRecord> }> {
    const { email, password } = loginDto;

    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'BANNED') {
      throw new BusinessException('Account has been banned', 'ACCOUNT_BANNED');
    }

    const isPasswordValid = await this.passwordHasher.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${email}`);

    return {
      accessToken: this.tokenIssuer.sign(buildAuthAccessTokenPayload(user)),
      user: sanitizeAuthUser(user),
    };
  }
}
