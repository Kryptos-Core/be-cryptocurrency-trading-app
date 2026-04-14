import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException } from '@/common/exceptions';
import { PASSWORD_HASHER } from '@/modules/auth/application/ports/password-hasher.token';
import { RegisterUserUseCase } from '@/modules/auth/application/use-cases/register-user.use-case';
import { UsersRepository } from '@/modules/users/repositories';

describe('RegisterUserUseCase', () => {
  const usersRepository = {
    emailExists: jest.fn(),
    createUser: jest.fn(),
  };
  const passwordHasher = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn(),
  };

  let useCase: RegisterUserUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        RegisterUserUseCase,
        { provide: UsersRepository, useValue: usersRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: PASSWORD_HASHER, useValue: passwordHasher },
      ],
    }).compile();

    useCase = moduleRef.get(RegisterUserUseCase);
  });

  it('creates a user with formatted names and signed token', async () => {
    usersRepository.emailExists.mockResolvedValue(false);
    passwordHasher.hash.mockResolvedValue('hashed-password');
    usersRepository.createUser.mockResolvedValue({
      user_id: 'u1',
      email: 'john@example.com',
      first_name: 'John',
      last_name: 'Doe',
      role: 'TRADER',
      status: 'ACTIVE',
      identity_verified: 0,
      email_verified: 0,
      password_hash: 'secret',
      two_fa_secret: '2fa',
    });
    jwtService.sign.mockReturnValue('jwt-token');

    const result = await useCase.execute({
      email: 'john@example.com',
      password: 'secret',
      firstName: ' john ',
      lastName: 'doe',
    } as any);

    expect(usersRepository.createUser).toHaveBeenCalledWith(
      'john@example.com',
      'hashed-password',
      'John',
      'Doe',
    );
    expect(result).toEqual({
      accessToken: 'jwt-token',
      user: expect.objectContaining({
        user_id: 'u1',
        email: 'john@example.com',
        first_name: 'John',
        last_name: 'Doe',
      }),
    });
    expect((result.user as any).password_hash).toBeUndefined();
    expect((result.user as any).two_fa_secret).toBeUndefined();
  });

  it('rejects duplicate email before hashing', async () => {
    usersRepository.emailExists.mockResolvedValue(true);

    await expect(
      useCase.execute({
        email: 'existing@example.com',
        password: 'secret',
        firstName: 'Jane',
        lastName: 'Doe',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(usersRepository.createUser).not.toHaveBeenCalled();
  });
});
