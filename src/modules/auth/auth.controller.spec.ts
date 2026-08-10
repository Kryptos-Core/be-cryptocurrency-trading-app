import { Test, type TestingModule } from '@nestjs/testing';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { isWalletPlaceholderEmail } from '@/common/utils/wallet-placeholder-email.util';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwoFaService } from './two-fa.service';
import { WalletAuthService } from './wallet-auth.service';
import { WalletConnectAuthService } from './wallet-connect-auth.service';

jest.mock('@/common/utils/wallet-placeholder-email.util', () => ({
  isWalletPlaceholderEmail: jest.fn(),
}));

describe('AuthController — OTP-flagged endpoints', () => {
  let controller: AuthController;
  let authService: { getUserById: jest.Mock; loginEmailOnly: jest.Mock; listSandboxUsers: jest.Mock };
  let twoFaService: { sendOtp: jest.Mock };
  let systemConfigService: { isEmailVerificationRequired: jest.Mock; isTreasuryWalletTotpRequired: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    authService = { getUserById: jest.fn(), loginEmailOnly: jest.fn(), listSandboxUsers: jest.fn() };
    twoFaService = { sendOtp: jest.fn().mockResolvedValue({ expiresIn: 300 }) };
    systemConfigService = {
      isEmailVerificationRequired: jest.fn().mockResolvedValue(true),
      isTreasuryWalletTotpRequired: jest.fn().mockResolvedValue(true),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: TwoFaService, useValue: twoFaService },
        { provide: WalletAuthService, useValue: {} },
        { provide: WalletConnectAuthService, useValue: {} },
        { provide: SystemConfigService, useValue: systemConfigService },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  describe('sendTwoFaOtp', () => {
    it('returns { skipped: true } when email verification is disabled by admin', async () => {
      systemConfigService.isEmailVerificationRequired.mockResolvedValue(false);

      const result = await controller.sendTwoFaOtp('u1');

      expect(result).toEqual({ skipped: true });
      // Should NOT call downstream services when skipped.
      expect(authService.getUserById).not.toHaveBeenCalled();
      expect(twoFaService.sendOtp).not.toHaveBeenCalled();
    });

    it('throws ContactEmailRequired when user email is still a wallet placeholder', async () => {
      authService.getUserById.mockResolvedValue({ user_id: 'u1', email: '0xabc@eth.wallet' });
      (isWalletPlaceholderEmail as unknown as jest.Mock).mockReturnValue(true);

      await expect(controller.sendTwoFaOtp('u1')).rejects.toMatchObject({
        code: 'CONTACT_EMAIL_REQUIRED',
      });
      expect(twoFaService.sendOtp).not.toHaveBeenCalled();
    });

    it('delegates to TwoFaService.sendOtp when email verification is required', async () => {
      authService.getUserById.mockResolvedValue({ user_id: 'u1', email: 'real@example.com' });
      (isWalletPlaceholderEmail as unknown as jest.Mock).mockReturnValue(false);

      const result = await controller.sendTwoFaOtp('u1');

      expect(twoFaService.sendOtp).toHaveBeenCalledWith('u1', 'real@example.com');
      expect(result).toEqual({ expiresIn: 300 });
    });
  });

  describe('getAuthSecurityFlags', () => {
    it('returns both flags from the SystemConfigService', async () => {
      systemConfigService.isEmailVerificationRequired.mockResolvedValue(false);
      systemConfigService.isTreasuryWalletTotpRequired.mockResolvedValue(false);

      await expect(controller.getAuthSecurityFlags()).resolves.toEqual({
        emailVerificationRequired: false,
        treasuryWalletTotpRequired: false,
      });
    });

    it('defaults both flags to true when SystemConfigService reports true', async () => {
      await expect(controller.getAuthSecurityFlags()).resolves.toEqual({
        emailVerificationRequired: true,
        treasuryWalletTotpRequired: true,
      });
    });
  });

  describe('loginEmailOnly', () => {
    it('delegates to AuthService.loginEmailOnly with the request body', async () => {
      authService.loginEmailOnly.mockResolvedValue({ accessToken: 'tok', user: { email: 'a@b' } });
      const result = await controller.loginEmailOnly({ email: 'a@b' } as any);
      expect(authService.loginEmailOnly).toHaveBeenCalledWith({ email: 'a@b' });
      expect(result).toEqual({ accessToken: 'tok', user: { email: 'a@b' } });
    });
  });

  describe('listSandboxUsers', () => {
    it('delegates to AuthService.listSandboxUsers', async () => {
      authService.listSandboxUsers.mockResolvedValue([{ userId: 'u1' }]);
      const result = await controller.listSandboxUsers();
      expect(authService.listSandboxUsers).toHaveBeenCalled();
      expect(result).toEqual([{ userId: 'u1' }]);
    });
  });
});