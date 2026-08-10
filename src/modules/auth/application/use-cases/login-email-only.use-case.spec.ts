import { Test } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@/common/exceptions';
import { TOKEN_ISSUER } from '@/modules/auth/application/ports/token-issuer.token';
import { LoginEmailOnlyUseCase } from '@/modules/auth/application/use-cases/login-email-only.use-case';
import { USERS_REPOSITORY } from '@/modules/users/domain/ports';

describe('LoginEmailOnlyUseCase', () => {
  const usersRepository = {
    findByEmail: jest.fn(),
  };
  const tokenIssuer = {
    sign: jest.fn(),
  };

  let useCase: LoginEmailOnlyUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        LoginEmailOnlyUseCase,
        { provide: USERS_REPOSITORY, useValue: usersRepository },
        { provide: TOKEN_ISSUER, useValue: tokenIssuer },
      ],
    }).compile();

    useCase = moduleRef.get(LoginEmailOnlyUseCase);
  });

  it('returns token and sanitized user for an ACTIVE user', async () => {
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
    tokenIssuer.sign.mockReturnValue('jwt-token');

    const result = await useCase.execute({ email: 'john@example.com' } as any);

    expect(tokenIssuer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        email: 'john@example.com',
        role: 'TRADER',
      }),
    );
    expect(result.accessToken).toBe('jwt-token');
    expect((result.user as any).password_hash).toBeUndefined();
    expect((result.user as any).two_fa_secret).toBeUndefined();
  });

  it('rejects unknown email with UnauthorizedException', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute({ email: 'missing@example.com' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenIssuer.sign).not.toHaveBeenCalled();
  });

  it('rejects non-ACTIVE user with ForbiddenException', async () => {
    usersRepository.findByEmail.mockResolvedValue({
      user_id: 'u1',
      email: 'john@example.com',
      role: 'TRADER',
      status: 'BANNED',
      password_hash: 'stored-hash',
    });

    await expect(
      useCase.execute({ email: 'john@example.com' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokenIssuer.sign).not.toHaveBeenCalled();
  });

  it('rejects PENDING user with ForbiddenException', async () => {
    usersRepository.findByEmail.mockResolvedValue({
      user_id: 'u2',
      email: 'pending@example.com',
      role: 'TRADER',
      status: 'PENDING',
      password_hash: 'stored-hash',
    });

    await expect(
      useCase.execute({ email: 'pending@example.com' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
