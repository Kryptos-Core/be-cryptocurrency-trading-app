import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConflictException } from '@/common/exceptions';
import { formatName } from '@/common/utils/name.util';
import type { PasswordHasherPort } from '@/modules/auth/application/ports/password-hasher.port';
import { PASSWORD_HASHER } from '@/modules/auth/application/ports/password-hasher.token';
import type { TokenIssuerPort } from '@/modules/auth/application/ports/token-issuer.port';
import { TOKEN_ISSUER } from '@/modules/auth/application/ports/token-issuer.token';
import type { RegisterDto } from '@/modules/auth/dto';
import type { UserRecord } from '@/modules/users';
import { USERS_REPOSITORY, type UsersRepositoryPort } from '@/modules/users/domain/ports';
import { buildAuthAccessTokenPayload, sanitizeAuthUser } from './shared/auth-response.util';

@Injectable()
export class RegisterUserUseCase {
  private readonly logger = new Logger(RegisterUserUseCase.name);

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
    @Inject(TOKEN_ISSUER)
    private readonly tokenIssuer: TokenIssuerPort,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(
    registerDto: RegisterDto,
  ): Promise<{ accessToken: string; user: Partial<UserRecord> }> {
    const { email, password, firstName, lastName } = registerDto;

    const emailExists = await this.usersRepository.emailExists(email);
    if (emailExists) {
      throw new ConflictException('Email already exists', 'EMAIL_EXISTS');
    }

    const passwordHash = await this.passwordHasher.hash(password);
    const formattedFirstName = formatName(firstName);
    const formattedLastName = formatName(lastName);

    const user = await this.usersRepository.createUser(
      email,
      passwordHash,
      formattedFirstName,
      formattedLastName,
    );

    this.logger.log(`New user registered: ${email}`);

    return {
      accessToken: this.tokenIssuer.sign(buildAuthAccessTokenPayload(user)),
      user: sanitizeAuthUser(user),
    };
  }
}
