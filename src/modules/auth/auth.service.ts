import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, UnauthorizedException } from '@/common/exceptions';
import { ChangePasswordUseCase } from '@/modules/auth/application/use-cases/change-password.use-case';
import { ListSandboxUsersUseCase } from '@/modules/auth/application/use-cases/list-sandbox-users.use-case';
import { LoginEmailOnlyUseCase } from '@/modules/auth/application/use-cases/login-email-only.use-case';
import { LoginWithPasswordUseCase } from '@/modules/auth/application/use-cases/login-with-password.use-case';
import { RegisterUserUseCase } from '@/modules/auth/application/use-cases/register-user.use-case';
import { isSandboxMode } from '@/modules/auth/application/utils/sandbox-mode.util';
import type { DevUserPickDto } from '@/modules/auth/dto/dev-user-pick.dto';
import type { LoginEmailOnlyDto } from '@/modules/auth/dto/login-email-only.dto';
import type { UserRecord } from '@/modules/users';
import { USERS_REPOSITORY, type UsersRepositoryPort } from '@/modules/users/domain/ports';
import type { ChangePasswordDto, LoginDto, RegisterDto } from './dto';

/**
 * Transitional facade that keeps the current controller contract while
 * moving auth behavior into application use cases.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly loginWithPasswordUseCase: LoginWithPasswordUseCase,
    private readonly loginEmailOnlyUseCase: LoginEmailOnlyUseCase,
    private readonly listSandboxUsersUseCase: ListSandboxUsersUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly config: ConfigService,
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
  ) {}

  register(registerDto: RegisterDto): Promise<{ accessToken: string; user: Partial<UserRecord> }> {
    return this.registerUserUseCase.execute(registerDto);
  }

  login(loginDto: LoginDto): Promise<{ accessToken: string; user: Partial<UserRecord> }> {
    return this.loginWithPasswordUseCase.execute(loginDto);
  }

  async loginEmailOnly(
    dto: LoginEmailOnlyDto,
  ): Promise<{ accessToken: string; user: Partial<UserRecord> }> {
    this.assertSandboxMode();
    return this.loginEmailOnlyUseCase.execute(dto);
  }

  async listSandboxUsers(): Promise<DevUserPickDto[]> {
    this.assertSandboxMode();
    return this.listSandboxUsersUseCase.execute();
  }

  private assertSandboxMode(): void {
    if (!isSandboxMode(this.config)) {
      // 404 (not 403) on purpose — hide the existence of dev-only endpoints in production.
      throw new NotFoundException('Endpoint not found');
    }
  }

  async getProfile(_userId: string): Promise<Partial<UserRecord>> {
    throw new UnauthorizedException('User profile endpoint should be called from users service');
  }

  async getUserById(userId: string): Promise<UserRecord> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  changePassword(userId: string, dto: ChangePasswordDto): Promise<{ success: boolean }> {
    return this.changePasswordUseCase.execute(userId, dto);
  }
}
