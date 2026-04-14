import { Injectable, Logger, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BusinessException, UnauthorizedException } from '@/common/exceptions';
import type { User } from '@/entities/user.entity';
import { PASSWORD_HASHER } from '@/modules/auth/application/ports/password-hasher.token';
import type { PasswordHasherPort } from '@/modules/auth/application/ports/password-hasher.port';
import type { LoginDto } from '@/modules/auth/dto';
import { UsersRepository } from '@/modules/users/repositories';
import { buildAuthAccessTokenPayload, sanitizeAuthUser } from './shared/auth-response.util';

@Injectable()
export class LoginWithPasswordUseCase {
  private readonly logger = new Logger(LoginWithPasswordUseCase.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(loginDto: LoginDto): Promise<{ accessToken: string; user: Partial<User> }> {
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
      accessToken: this.jwtService.sign(buildAuthAccessTokenPayload(user)),
      user: sanitizeAuthUser(user),
    };
  }
}
