import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedException } from '@/common/exceptions';
import type { UserRecord } from '@/modules/users';
import { ChangePasswordUseCase } from '@/modules/auth/application/use-cases/change-password.use-case';
import { LoginWithPasswordUseCase } from '@/modules/auth/application/use-cases/login-with-password.use-case';
import { RegisterUserUseCase } from '@/modules/auth/application/use-cases/register-user.use-case';
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
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
  ) {}

  register(registerDto: RegisterDto): Promise<{ accessToken: string; user: Partial<UserRecord> }> {
    return this.registerUserUseCase.execute(registerDto);
  }

  login(loginDto: LoginDto): Promise<{ accessToken: string; user: Partial<UserRecord> }> {
    return this.loginWithPasswordUseCase.execute(loginDto);
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



