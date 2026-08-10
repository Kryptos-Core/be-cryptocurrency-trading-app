import { Inject, Injectable, Logger } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@/common/exceptions';
import { runInSpan } from '@/common/telemetry';
import type { TokenIssuerPort } from '@/modules/auth/application/ports/token-issuer.port';
import { TOKEN_ISSUER } from '@/modules/auth/application/ports/token-issuer.token';
import type { LoginEmailOnlyDto } from '@/modules/auth/dto/login-email-only.dto';
import type { UserRecord } from '@/modules/users';
import { USERS_REPOSITORY, type UsersRepositoryPort } from '@/modules/users/domain/ports';
import { buildAuthAccessTokenPayload, sanitizeAuthUser } from './shared/auth-response.util';

@Injectable()
export class LoginEmailOnlyUseCase {
  private readonly logger = new Logger(LoginEmailOnlyUseCase.name);

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
    @Inject(TOKEN_ISSUER)
    private readonly tokenIssuer: TokenIssuerPort,
  ) {}

  async execute(
    dto: LoginEmailOnlyDto,
  ): Promise<{ accessToken: string; user: Partial<UserRecord> }> {
    return runInSpan('Auth.LoginEmailOnly', async () => this.executeImpl(dto), {
      module: 'auth',
    });
  }

  private async executeImpl(
    dto: LoginEmailOnlyDto,
  ): Promise<{ accessToken: string; user: Partial<UserRecord> }> {
    const { email } = dto;

    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active', 'ACCOUNT_NOT_ACTIVE');
    }

    this.logger.warn(`[SANDBOX-LOGIN] email=${email} uid=${user.user_id}`);

    return {
      accessToken: this.tokenIssuer.sign(buildAuthAccessTokenPayload(user)),
      user: sanitizeAuthUser(user),
    };
  }
}
