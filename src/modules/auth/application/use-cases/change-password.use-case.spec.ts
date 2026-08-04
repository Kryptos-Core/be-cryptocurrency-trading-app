import { Test } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@/common/exceptions';
import { PASSWORD_HASHER } from '@/modules/auth/application/ports/password-hasher.token';
import { ChangePasswordUseCase } from '@/modules/auth/application/use-cases/change-password.use-case';
import { AUTH_REPOSITORY } from '@/modules/auth/domain/ports';
import { TwoFaService } from '@/modules/auth/two-fa.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { USERS_REPOSITORY } from '@/modules/users/domain/ports';

describe('ChangePasswordUseCase', () => {
  const usersRepository = {
    findById: jest.fn(),
  };
  const authRepository = {
    updatePassword: jest.fn(),
  };
  const twoFaService = {
    verifyOtp: jest.fn(),
  };
  const passwordHasher = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const systemConfigService = {
    isEmailVerificationRequired: jest.fn(),
  };

  let useCase: ChangePasswordUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChangePasswordUseCase,
        { provide: USERS_REPOSITORY, useValue: usersRepository },
        { provide: AUTH_REPOSITORY, useValue: authRepository },
        { provide: TwoFaService, useValue: twoFaService },
        { provide: PASSWORD_HASHER, useValue: passwordHasher },
        { provide: SystemConfigService, useValue: systemConfigService },
      ],
    }).compile();

    useCase = moduleRef.get(ChangePasswordUseCase);
  });

  it('updates password after otp verification when email verification is required', async () => {
    usersRepository.findById.mockResolvedValue({ user_id: 'u1', two_fa_enabled: 1 });
    systemConfigService.isEmailVerificationRequired.mockResolvedValue(true);
    twoFaService.verifyOtp.mockResolvedValue(true);
    passwordHasher.hash.mockResolvedValue('hashed-password');

    const result = await useCase.execute('u1', {
      otpCode: '123456',
      newPassword: 'new-secret',
    } as any);

    expect(passwordHasher.hash).toHaveBeenCalledWith('new-secret');
    expect(authRepository.updatePassword).toHaveBeenCalledWith('u1', 'hashed-password');
    expect(result).toEqual({ success: true });
  });

  it('updates password without OTP when email verification is disabled by admin', async () => {
    usersRepository.findById.mockResolvedValue({ user_id: 'u1', two_fa_enabled: 1 });
    systemConfigService.isEmailVerificationRequired.mockResolvedValue(false);
    passwordHasher.hash.mockResolvedValue('hashed-password');

    const result = await useCase.execute('u1', {
      newPassword: 'new-secret',
    } as any);

    expect(twoFaService.verifyOtp).not.toHaveBeenCalled();
    expect(passwordHasher.hash).toHaveBeenCalledWith('new-secret');
    expect(authRepository.updatePassword).toHaveBeenCalledWith('u1', 'hashed-password');
    expect(result).toEqual({ success: true });
  });

  it('rejects when email verification required but no OTP provided', async () => {
    usersRepository.findById.mockResolvedValue({ user_id: 'u1', two_fa_enabled: 1 });
    systemConfigService.isEmailVerificationRequired.mockResolvedValue(true);

    await expect(
      useCase.execute('u1', { newPassword: 'new-secret' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(authRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects when user is missing', async () => {
    usersRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('missing', { otpCode: '123456', newPassword: 'new-secret' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when otp is invalid when email verification is required', async () => {
    usersRepository.findById.mockResolvedValue({ user_id: 'u1', two_fa_enabled: 1 });
    systemConfigService.isEmailVerificationRequired.mockResolvedValue(true);
    twoFaService.verifyOtp.mockResolvedValue(false);

    await expect(
      useCase.execute('u1', { otpCode: '123456', newPassword: 'new-secret' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(authRepository.updatePassword).not.toHaveBeenCalled();
  });
});
