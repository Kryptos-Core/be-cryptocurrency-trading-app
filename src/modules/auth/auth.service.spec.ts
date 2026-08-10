import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@/common/exceptions';
import { ListSandboxUsersUseCase } from '@/modules/auth/application/use-cases/list-sandbox-users.use-case';
import { LoginEmailOnlyUseCase } from '@/modules/auth/application/use-cases/login-email-only.use-case';
import { AuthService } from '@/modules/auth/auth.service';
import { TOKEN_ISSUER } from '@/modules/auth/application/ports/token-issuer.token';
import { USERS_REPOSITORY } from '@/modules/users/domain/ports';

describe('AuthService — sandbox-only endpoints', () => {
  const loginEmailOnlyUseCase = { execute: jest.fn() };
  const listSandboxUsersUseCase = { execute: jest.fn() };
  const tokenIssuer = { sign: jest.fn() };
  const usersRepository = { findByEmail: jest.fn(), findById: jest.fn() };

  const buildConfig = (mode: string | null) => {
    return {
      get: jest.fn((key: string) => (key === 'ONCHAIN_OPERATOR_MODE' ? mode : undefined)),
    } as unknown as ConfigService;
  };

  const buildService = async (mode: string | null) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: USERS_REPOSITORY, useValue: usersRepository },
        { provide: TOKEN_ISSUER, useValue: tokenIssuer },
        { provide: LoginEmailOnlyUseCase, useValue: loginEmailOnlyUseCase },
        { provide: ListSandboxUsersUseCase, useValue: listSandboxUsersUseCase },
        { provide: ConfigService, useFactory: () => buildConfig(mode) },
      ],
    }).compile();

    // AuthService has more dependencies than the production module — replace via
    // partial stub. Simpler: instantiate the bare facade manually for guard tests.
    const service = new AuthService(
      {} as any,
      {} as any,
      loginEmailOnlyUseCase as any,
      listSandboxUsersUseCase as any,
      {} as any,
      buildConfig(mode),
      usersRepository as any,
    );
    await moduleRef.init();
    return service;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loginEmailOnly', () => {
    it('throws NotFoundException when ONCHAIN_OPERATOR_MODE is not sandbox', async () => {
      const service = await buildConfig('production') as any;
      const svc = new AuthService(
        {} as any,
        {} as any,
        loginEmailOnlyUseCase as any,
        listSandboxUsersUseCase as any,
        {} as any,
        service,
        usersRepository as any,
      );
      await expect(svc.loginEmailOnly({ email: 'a@b.com' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(loginEmailOnlyUseCase.execute).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when ONCHAIN_OPERATOR_MODE is missing', async () => {
      const svc = new AuthService(
        {} as any,
        {} as any,
        loginEmailOnlyUseCase as any,
        listSandboxUsersUseCase as any,
        {} as any,
        buildConfig(null) as any,
        usersRepository as any,
      );
      await expect(svc.loginEmailOnly({ email: 'a@b.com' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('delegates to use-case when ONCHAIN_OPERATOR_MODE=sandbox', async () => {
      const svc = new AuthService(
        {} as any,
        {} as any,
        loginEmailOnlyUseCase as any,
        listSandboxUsersUseCase as any,
        {} as any,
        buildConfig('sandbox') as any,
        usersRepository as any,
      );
      loginEmailOnlyUseCase.execute.mockResolvedValue({ accessToken: 't', user: {} });
      const result = await svc.loginEmailOnly({ email: 'a@b.com' } as any);
      expect(loginEmailOnlyUseCase.execute).toHaveBeenCalledWith({ email: 'a@b.com' });
      expect(result).toEqual({ accessToken: 't', user: {} });
    });

    it('is case-insensitive: ONCHAIN_OPERATOR_MODE=SANDBOX also passes', async () => {
      const svc = new AuthService(
        {} as any,
        {} as any,
        loginEmailOnlyUseCase as any,
        listSandboxUsersUseCase as any,
        {} as any,
        buildConfig('SANDBOX') as any,
        usersRepository as any,
      );
      loginEmailOnlyUseCase.execute.mockResolvedValue({ accessToken: 't', user: {} });
      await expect(svc.loginEmailOnly({ email: 'a@b.com' } as any)).resolves.toBeDefined();
    });
  });

  describe('listSandboxUsers', () => {
    it('throws NotFoundException when not sandbox', async () => {
      const svc = new AuthService(
        {} as any,
        {} as any,
        loginEmailOnlyUseCase as any,
        listSandboxUsersUseCase as any,
        {} as any,
        buildConfig('production') as any,
        usersRepository as any,
      );
      await expect(svc.listSandboxUsers()).rejects.toBeInstanceOf(NotFoundException);
      expect(listSandboxUsersUseCase.execute).not.toHaveBeenCalled();
    });

    it('delegates to use-case when sandbox', async () => {
      const svc = new AuthService(
        {} as any,
        {} as any,
        loginEmailOnlyUseCase as any,
        listSandboxUsersUseCase as any,
        {} as any,
        buildConfig('sandbox') as any,
        usersRepository as any,
      );
      listSandboxUsersUseCase.execute.mockResolvedValue([{ userId: 'u1' }]);
      const result = await svc.listSandboxUsers();
      expect(result).toEqual([{ userId: 'u1' }]);
    });
  });
});
