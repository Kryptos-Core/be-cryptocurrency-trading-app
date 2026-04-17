import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@/common/exceptions';
import { CloudinaryService } from '@/common/services';
import { TwoFaService } from '@/modules/auth/two-fa.service';
import { ORDER_REPOSITORY } from '@/modules/orders/domain/ports';
import type { UserRecord } from '@/modules/users';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { USERS_REPOSITORY } from './domain/ports';
import type {
  RequestSecurityChangeDto,
  ReviewSecurityChangeDto,
  UpdateMyProfileBasicDto,
} from './dto';
import { UserRecordsRepository } from './infrastructure/persistence';
import { UserRecordsService } from './users.service';

describe('UserRecordsService', () => {
  let service: UserRecordsService;
  let usersRepository: jest.Mocked<UserRecordsRepository>;
  let cloudinaryService: jest.Mocked<CloudinaryService>;
  let twoFaService: jest.Mocked<TwoFaService>;

  const mockUserRecord: UserRecord = {
    user_id: 'user-1',
    email: 'u@test.com',
    password_hash: 'hash',
    first_name: 'John',
    last_name: 'Doe',
    status: 'ACTIVE',
    role: 'TRADER',
    avatar_url: null,
    avatar_public_id: null,
    two_fa_enabled: 1,
    created_at: new Date(),
  } as UserRecord;

  beforeEach(async () => {
    const mockRepo = {
      findById: jest.fn(),
      emailExists: jest.fn(),
      updateProfileBasic: jest.fn(),
      createSecurityChangeRequest: jest.fn(),
      findPendingSecurityChangeRequests: jest.fn(),
      reviewSecurityChangeRequest: jest.fn(),
      updateAvatar: jest.fn(),
    };
    const mockCloudinary = {
      isConfigured: jest.fn().mockReturnValue(true),
      upload: jest
        .fn()
        .mockResolvedValue({ url: 'https://cdn.example/av.jpg', publicId: 'avatars/av1' }),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    const mockTwoFa = {
      verifyOtp: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRecordsService,
        { provide: UserRecordsRepository, useValue: mockRepo },
        { provide: USERS_REPOSITORY, useValue: mockRepo },
        { provide: CloudinaryService, useValue: mockCloudinary },
        { provide: TwoFaService, useValue: mockTwoFa },
        { provide: WalletsService, useValue: {} },
        { provide: ORDER_REPOSITORY, useValue: {} },
      ],
    }).compile();

    service = module.get(UserRecordsService);
    usersRepository = module.get(UserRecordsRepository);
    cloudinaryService = module.get(CloudinaryService);
    twoFaService = module.get(TwoFaService);

    (usersRepository.findById as jest.Mock).mockResolvedValue(mockUserRecord);
  });

  describe('updateProfileBasic', () => {
    it('should update first and last name and return user', async () => {
      (usersRepository.updateProfileBasic as jest.Mock).mockResolvedValue(1);
      const dto: UpdateMyProfileBasicDto = { firstName: 'Jane', lastName: 'Smith' };
      const result = await service.updateProfileBasic('user-1', dto);
      expect(usersRepository.updateProfileBasic).toHaveBeenCalledWith('user-1', 'Jane', 'Smith');
      expect(result).toEqual(mockUserRecord);
    });
  });

  describe('requestSecurityChange', () => {
    it('should create EMAIL_CHANGE request with sanitized email', async () => {
      (usersRepository.emailExists as jest.Mock).mockResolvedValue(false);
      (usersRepository.createSecurityChangeRequest as jest.Mock).mockResolvedValue('req-1');
      const dto: RequestSecurityChangeDto = {
        changeType: 'EMAIL_CHANGE',
        payload: { email: '  NEW@Test.COM  ' },
        otpCode: '123456',
      };
      const result = await service.requestSecurityChange('user-1', dto);
      expect(result.requestId).toBeDefined();
      expect(result.status).toBe('PENDING');
      expect(usersRepository.createSecurityChangeRequest).toHaveBeenCalledWith(
        expect.any(String),
        'user-1',
        'EMAIL_CHANGE',
        { email: 'new@test.com' },
      );
    });

    it('should reject EMAIL_CHANGE for wallet placeholder email (use contact-email OTP flow)', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValueOnce({
        ...mockUserRecord,
        email: 'abcd1234@eth_sepolia.wallet',
        two_fa_enabled: 0,
      });
      const dto: RequestSecurityChangeDto = {
        changeType: 'EMAIL_CHANGE',
        payload: { email: 'human@example.com' },
        otpCode: '123456',
      };
      await expect(service.requestSecurityChange('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(twoFaService.verifyOtp).not.toHaveBeenCalled();
      expect(usersRepository.createSecurityChangeRequest).not.toHaveBeenCalled();
    });

    it('should reject EMAIL_CHANGE if email already exists', async () => {
      (usersRepository.emailExists as jest.Mock).mockResolvedValue(true);
      const dto: RequestSecurityChangeDto = {
        changeType: 'EMAIL_CHANGE',
        payload: { email: 'existing@test.com' },
        otpCode: '123456',
      };
      await expect(service.requestSecurityChange('user-1', dto)).rejects.toThrow(ConflictException);
    });

    it('should reject PASSWORD_CHANGE (use change-password endpoint instead)', async () => {
      const dto: RequestSecurityChangeDto = {
        changeType: 'PASSWORD_CHANGE',
        payload: { password: 'newpass123' },
        otpCode: '123456',
      };
      await expect(service.requestSecurityChange('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject PASSWORD_CHANGE if password too short', async () => {
      const dto: RequestSecurityChangeDto = {
        changeType: 'PASSWORD_CHANGE',
        payload: { password: 'short' },
        otpCode: '123456',
      };
      await expect(service.requestSecurityChange('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if 2FA not enabled', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValueOnce({
        ...mockUserRecord,
        two_fa_enabled: 0,
      });
      const dto: RequestSecurityChangeDto = {
        changeType: 'EMAIL_CHANGE',
        payload: { email: 'new@test.com' },
        otpCode: '123456',
      };
      await expect(service.requestSecurityChange('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getPendingSecurityChangeRequests', () => {
    it('should return list from repository', async () => {
      const rows = [
        {
          request_id: 'r1',
          user_id: 'user-1',
          change_type: 'EMAIL_CHANGE',
          payload_json: '{}',
          requested_at: new Date(),
          user_email: 'u@test.com',
          first_name: 'John',
          last_name: 'Doe',
        },
      ];
      (usersRepository.findPendingSecurityChangeRequests as jest.Mock).mockResolvedValue(rows);
      const result = await service.getPendingSecurityChangeRequests();
      expect(result).toHaveLength(1);
      expect(result[0].requestId).toBe('r1');
      expect(result[0].userEmail).toBe('u@test.com');
    });
  });

  describe('reviewSecurityChangeRequest', () => {
    it('should call repository and return result', async () => {
      (usersRepository.reviewSecurityChangeRequest as jest.Mock).mockResolvedValue({
        request_id: 'r1',
        user_id: 'user-1',
        status: 'APPROVED',
      });
      const dto: ReviewSecurityChangeDto = { approve: true };
      const result = await service.reviewSecurityChangeRequest('r1', 'reviewer-1', dto);
      expect(result.requestId).toBe('r1');
      expect(result.status).toBe('APPROVED');
      expect(usersRepository.reviewSecurityChangeRequest).toHaveBeenCalledWith(
        'r1',
        'reviewer-1',
        true,
        null,
      );
    });

    it('should throw NotFoundException when request not found', async () => {
      (usersRepository.reviewSecurityChangeRequest as jest.Mock).mockResolvedValue(null);
      const dto: ReviewSecurityChangeDto = { approve: false, reviewNote: 'Nope' };
      await expect(
        service.reviewSecurityChangeRequest('bad-id', 'reviewer-1', dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadAvatar', () => {
    it('should upload to Cloudinary, delete old avatar if any, and update user', async () => {
      (usersRepository.updateAvatar as jest.Mock).mockResolvedValue(1);
      const buffer = Buffer.from('fake-image-bytes');
      const result = await service.uploadAvatar('user-1', buffer);
      expect(cloudinaryService.upload).toHaveBeenCalledWith(buffer, expect.any(String));
      expect(usersRepository.updateAvatar).toHaveBeenCalled();
      expect(result).toEqual(mockUserRecord);
    });

    it('should throw when Cloudinary is not configured', async () => {
      (cloudinaryService.isConfigured as jest.Mock).mockReturnValue(false);
      await expect(service.uploadAvatar('user-1', Buffer.from('x'))).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
