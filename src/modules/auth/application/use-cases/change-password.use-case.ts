import { Inject, Injectable, Logger } from '@nestjs/common';
import { BadRequestException, UnauthorizedException } from '@/common/exceptions';
import type { PasswordHasherPort } from '@/modules/auth/application/ports/password-hasher.port';
import { PASSWORD_HASHER } from '@/modules/auth/application/ports/password-hasher.token';
import { AUTH_REPOSITORY, type AuthRepositoryPort } from '@/modules/auth/domain/ports';
import type { ChangePasswordDto } from '@/modules/auth/dto';
import { TwoFaService } from '@/modules/auth/two-fa.service';
import { USERS_REPOSITORY, type UsersRepositoryPort } from '@/modules/users/domain/ports';

@Injectable()
export class ChangePasswordUseCase {
  private readonly logger = new Logger(ChangePasswordUseCase.name);

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepositoryPort,
    private readonly twoFaService: TwoFaService,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(userId: string, dto: ChangePasswordDto): Promise<{ success: boolean }> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.two_fa_enabled !== 1) {
      throw new BadRequestException(
        'Vui long bat xac thuc hai buoc trong Cai dat truoc khi doi mat khau.',
        'TWO_FA_REQUIRED',
      );
    }

    const otpValid = await this.twoFaService.verifyOtp(userId, dto.otpCode);
    if (!otpValid) {
      throw new BadRequestException('OTP khong hop le hoac da het han', 'INVALID_OTP');
    }

    const passwordHash = await this.passwordHasher.hash(dto.newPassword);
    await this.authRepository.updatePassword(userId, passwordHash);

    this.logger.log(`Password changed for user=${userId}`);
    return { success: true };
  }
}
