import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BusinessException, UnauthorizedException } from '@/common/exceptions';
import { PASSWORD_HASHER } from '@/modules/auth/application/ports/password-hasher.token';
import { LoginWithPasswordUseCase } from '@/modules/auth/application/use-cases/login-with-password.use-case';
import { UsersRepository } from '@/modules/users/repositories';

describe('LoginWithPasswordUseCase', () => {
  const usersRepository = {
    findByEmail: jest.fn(),
  };
  const passwordHasher = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn(),
  };

  let useCase: LoginWithPasswordUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        LoginWithPasswordUseCase,
        { provide: UsersRepository, useValue: usersRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: PASSWORD_HASHER, useValue: passwordHasher },
      ],
    }).compile();

    useCase = moduleRef.get(LoginWithPasswordUseCase);
  });

  it('returns token and sanitized user for valid credentials', async () => {
    usersRepository.findByEmail.mockResolvedValue({
      user_id: 'u1',
      email: 'john@example.com',
      role: 'TRADER',
      status: 'ACTIVE',
      identity_verified: 1,
      email_verified: 1,
      password_hash: 'stored-hash',
      two_fa_secret: '2fa',
    });
    passwordHasher.compare.mockResolvedValue(true);
    jwtService.sign.mockReturnValue('jwt-token');

    const result = await useCase.execute({
      email: 'john@example.com',
      password: 'secret',
    } as any);

    expect(passwordHasher.compare).toHaveBeenCalledWith('secret', 'stored-hash');
    expect(result.accessToken).toBe('jwt-token');
    expect((result.user as any).password_hash).toBeUndefined();
    expect((result.user as any).two_fa_secret).toBeUndefined();
  });

  it('rejects banned users with business error', async () => {
    usersRepository.findByEmail.mockResolvedValue({
      user_id: 'u1',
      email: 'john@example.com',
      role: 'TRADER',
      status: 'BANNED',
      identity_verified: 0,
      email_verified: 0,
      password_hash: 'stored-hash',
    });

    await expect(
      useCase.execute({ email: 'john@example.com', password: 'secret' } as any),
    ).rejects.toBeInstanceOf(BusinessException);
  });

  it('rejects invalid password', async () => {
    usersRepository.findByEmail.mockResolvedValue({
      user_id: 'u1',
      email: 'john@example.com',
      role: 'TRADER',
      status: 'ACTIVE',
      identity_verified: 0,
      email_verified: 0,
      password_hash: 'stored-hash',
    });
    passwordHasher.compare.mockResolvedValue(false);

    await expect(
      useCase.execute({ email: 'john@example.com', password: 'bad' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
