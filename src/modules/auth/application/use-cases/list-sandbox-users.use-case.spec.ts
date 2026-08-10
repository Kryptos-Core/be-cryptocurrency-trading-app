import { Test } from '@nestjs/testing';
import { ListSandboxUsersUseCase } from '@/modules/auth/application/use-cases/list-sandbox-users.use-case';
import { USERS_REPOSITORY } from '@/modules/users/domain/ports';

describe('ListSandboxUsersUseCase', () => {
  const usersRepository = {
    findActiveForSandbox: jest.fn(),
  };

  let useCase: ListSandboxUsersUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ListSandboxUsersUseCase,
        { provide: USERS_REPOSITORY, useValue: usersRepository },
      ],
    }).compile();

    useCase = moduleRef.get(ListSandboxUsersUseCase);
  });

  it('maps active users to a safe DTO with no sensitive fields', async () => {
    usersRepository.findActiveForSandbox.mockResolvedValue([
      {
        user_id: 'u1',
        email: 'admin@example.com',
        first_name: 'Admin',
        last_name: 'User',
        role: 'ADMIN',
        status: 'ACTIVE',
        avatar_url: 'https://example.com/a.png',
        created_at: new Date('2024-01-01T00:00:00Z'),
      },
    ]);

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      userId: 'u1',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      status: 'ACTIVE',
      avatarUrl: 'https://example.com/a.png',
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });
    // sensitive fields must NOT appear in the output
    expect((result[0] as any).password_hash).toBeUndefined();
    expect((result[0] as any).two_fa_secret).toBeUndefined();
    expect((result[0] as any).fcm_token).toBeUndefined();
  });

  it('returns empty array when repository has no active users', async () => {
    usersRepository.findActiveForSandbox.mockResolvedValue([]);
    const result = await useCase.execute();
    expect(result).toEqual([]);
  });

  it('propagates repository errors', async () => {
    usersRepository.findActiveForSandbox.mockRejectedValue(new Error('DB down'));
    await expect(useCase.execute()).rejects.toThrow('DB down');
  });
});
