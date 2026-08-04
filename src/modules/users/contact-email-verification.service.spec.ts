import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@/common/exceptions';
import { CacheService, MailService } from '@/common/services';
import { ONCHAIN_TRANSACTION_REPOSITORY } from '@/modules/blockchain/domain/ports';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { USERS_REPOSITORY } from './domain/ports';
import { ContactEmailVerificationService } from './contact-email-verification.service';

describe('ContactEmailVerificationService', () => {
  let service: ContactEmailVerificationService;
  let usersRepository: jest.Mocked<any>;
  let cacheService: jest.Mocked<CacheService>;
  let mailService: jest.Mocked<MailService>;
  let onchainTxRepo: jest.Mocked<any>;
  let systemConfigService: jest.Mocked<SystemConfigService>;

  const mockUser = {
    user_id: 'user-1',
    email: '0x1234@eth_sepolia.wallet',
    two_fa_enabled: 0,
  };

  beforeEach(async () => {
    const mockUsersRepo = {
      findById: jest.fn(),
      emailExists: jest.fn(),
      update: jest.fn(),
      setEmailVerified: jest.fn(),
    };
    const mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      getTtl: jest.fn(),
    };
    const mockMail = {
      sendContactEmailVerificationOtp: jest.fn(),
      sendEmailChangeNotification: jest.fn(),
    };
    const mockOnchainTx = {
      findPendingWithdrawals: jest.fn().mockResolvedValue([]),
    };
    const mockSystemConfig = {
      isEmailVerificationRequired: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactEmailVerificationService,
        { provide: USERS_REPOSITORY, useValue: mockUsersRepo },
        { provide: CacheService, useValue: mockCache },
        { provide: MailService, useValue: mockMail },
        { provide: ONCHAIN_TRANSACTION_REPOSITORY, useValue: mockOnchainTx },
        { provide: SystemConfigService, useValue: mockSystemConfig },
      ],
    }).compile();

    service = module.get(ContactEmailVerificationService);
    usersRepository = module.get(USERS_REPOSITORY);
    cacheService = module.get(CacheService);
    mailService = module.get(MailService);
    onchainTxRepo = module.get(ONCHAIN_TRANSACTION_REPOSITORY);
    systemConfigService = module.get(SystemConfigService);
  });

  describe('sendOtp', () => {
    it('throws EMAIL_VERIFICATION_DISABLED when email verification is disabled by admin', async () => {
      (systemConfigService.isEmailVerificationRequired as jest.Mock).mockResolvedValue(false);

      await expect(service.sendOtp('user-1', 'real@example.com')).rejects.toMatchObject({
        response: { errorCode: 'EMAIL_VERIFICATION_DISABLED' },
      });
    });

    it('sends OTP when email verification is required', async () => {
      (systemConfigService.isEmailVerificationRequired as jest.Mock).mockResolvedValue(true);
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (usersRepository.emailExists as jest.Mock).mockResolvedValue(false);
      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const result = await service.sendOtp('user-1', 'real@example.com');

      expect(result.expiresIn).toBe(300);
      expect(mailService.sendContactEmailVerificationOtp).toHaveBeenCalledWith(
        'real@example.com',
        expect.stringMatching(/^\d{6}$/),
      );
    });
  });

  describe('verifyAndUpdateEmail', () => {
    it('throws EMAIL_VERIFICATION_DISABLED when email verification is disabled by admin', async () => {
      (systemConfigService.isEmailVerificationRequired as jest.Mock).mockResolvedValue(false);

      await expect(
        service.verifyAndUpdateEmail('user-1', 'real@example.com', '123456'),
      ).rejects.toMatchObject({
        response: { errorCode: 'EMAIL_VERIFICATION_DISABLED' },
      });
    });

    it('verifies and updates email when email verification is required', async () => {
      (systemConfigService.isEmailVerificationRequired as jest.Mock).mockResolvedValue(true);
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser);
      (cacheService.get as jest.Mock).mockResolvedValue('123456');
      (cacheService.delete as jest.Mock).mockResolvedValue(undefined);
      (usersRepository.emailExists as jest.Mock).mockResolvedValue(false);
      (usersRepository.update as jest.Mock).mockResolvedValue(undefined);
      (usersRepository.setEmailVerified as jest.Mock).mockResolvedValue(undefined);
      const updatedUser = { ...mockUser, email: 'real@example.com', email_verified: 1 };
      (usersRepository.findById as jest.Mock)
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const result = await service.verifyAndUpdateEmail('user-1', 'real@example.com', '123456');

      expect(usersRepository.setEmailVerified).toHaveBeenCalledWith('user-1', true);
    });
  });
});
