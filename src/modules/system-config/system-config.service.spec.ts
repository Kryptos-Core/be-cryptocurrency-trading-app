import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { RedisService } from '@/common/services';
import { SYSTEM_CONFIG_REPOSITORY } from '@/modules/system-config/domain/ports';
import { SystemConfigService } from './system-config.service';

/**
 * Unit tests for [SystemConfigService] focusing on the runtime flag readers.
 * The DB / Redis interactions are mocked so we can drive every branch.
 */
describe('SystemConfigService — runtime flags', () => {
  const ORIGINAL_ENV = process.env;

  let service: SystemConfigService;
  let redisHget: jest.Mock;
  let repoFind: jest.Mock;
  let configGet: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };

    redisHget = jest.fn().mockResolvedValue(null);
    repoFind = jest.fn().mockResolvedValue([]);
    configGet = jest.fn().mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemConfigService,
        {
          provide: SYSTEM_CONFIG_REPOSITORY,
          useValue: {
            find: repoFind,
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
            createQueryRunner: () => ({
              connect: jest.fn(),
              release: jest.fn(),
              hasTable: jest.fn().mockResolvedValue(true),
            }),
          },
        },
        { provide: RedisService, useValue: { getClient: () => ({ hget: redisHget }) } },
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(SystemConfigService);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('isEmailVerificationRequired', () => {
    it('defaults to true when no DB row and no env var is present', async () => {
      expect(await service.isEmailVerificationRequired()).toBe(true);
    });

    it('returns false when env var is "false"', async () => {
      process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
      expect(await service.isEmailVerificationRequired()).toBe(false);
    });
  });

  describe('isTreasuryWalletTotpRequired', () => {
    it('defaults to true when ONCHAIN_OPERATOR_MODE is unset', async () => {
      delete process.env.ONCHAIN_OPERATOR_MODE;
      expect(await service.isTreasuryWalletTotpRequired()).toBe(true);
    });

    it('returns true when ONCHAIN_OPERATOR_MODE=production regardless of env var', async () => {
      process.env.ONCHAIN_OPERATOR_MODE = 'production';
      process.env.TREASURY_WALLET_TOTP_REQUIRED = 'false';
      expect(await service.isTreasuryWalletTotpRequired()).toBe(true);
    });

    it('returns true when ONCHAIN_OPERATOR_MODE=PRODUCTION (case insensitive)', async () => {
      process.env.ONCHAIN_OPERATOR_MODE = 'PRODUCTION';
      process.env.TREASURY_WALLET_TOTP_REQUIRED = 'false';
      expect(await service.isTreasuryWalletTotpRequired()).toBe(true);
    });

    it('returns false in sandbox when env var is "false"', async () => {
      process.env.ONCHAIN_OPERATOR_MODE = 'sandbox';
      process.env.TREASURY_WALLET_TOTP_REQUIRED = 'false';
      expect(await service.isTreasuryWalletTotpRequired()).toBe(false);
    });

    it('returns true in sandbox when env var is unset / "true"', async () => {
      process.env.ONCHAIN_OPERATOR_MODE = 'sandbox';
      delete process.env.TREASURY_WALLET_TOTP_REQUIRED;
      expect(await service.isTreasuryWalletTotpRequired()).toBe(true);
    });

    it('env fallback resolves to "true" for TREASURY_WALLET_TOTP_REQUIRED', () => {
      expect(service.resolveEnvFallback('TREASURY_WALLET_TOTP_REQUIRED')).toBe('true');
    });
  });
});