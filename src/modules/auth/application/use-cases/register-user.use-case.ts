import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConflictException } from '@/common/exceptions';
import { formatName } from '@/common/utils/name.util';
import type { User } from '@/entities/user.entity';
import { PASSWORD_HASHER } from '@/modules/auth/application/ports/password-hasher.token';
import type { PasswordHasherPort } from '@/modules/auth/application/ports/password-hasher.port';
import type { RegisterDto } from '@/modules/auth/dto';
import { UsersRepository } from '@/modules/users/repositories';
import { buildAuthAccessTokenPayload, sanitizeAuthUser } from './shared/auth-response.util';

@Injectable()
export class RegisterUserUseCase {
  private readonly logger = new Logger(RegisterUserUseCase.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(registerDto: RegisterDto): Promise<{ accessToken: string; user: Partial<User> }> {
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
      accessToken: this.jwtService.sign(buildAuthAccessTokenPayload(user)),
      user: sanitizeAuthUser(user),
    };
  }
}
