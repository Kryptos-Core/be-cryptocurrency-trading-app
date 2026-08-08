import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@/common/exceptions';
import { TwoFaService } from '@/modules/auth/two-fa.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import {
  ApproveMainWalletDeletionUseCase,
  ApproveMainWalletUseCase,
  CreateTransactionWalletUseCase,
  DeleteTransactionWalletUseCase,
  GetMainWalletQuery,
  GetTransactionWalletQuery,
  GetTreasuryOperationQuery,
  ImportMainWalletUseCase,
  RejectMainWalletDeletionUseCase,
  RejectMainWalletUseCase,
  RequestMainWalletDeletionUseCase,
  RevealMainWalletPrivateKeyUseCase,
  SetDefaultMainWalletUseCase,
  SetDefaultUserDepositUseCase,
  UnsetDefaultUserDepositUseCase,
  UpdateMainWalletLabelUseCase,
} from './application';
import { OnchainChainPickerService } from './onchain-chain-picker.service';
import { TreasuryController } from './treasury.controller';
import { TreasuryOperationsService } from './treasury-operations.service';

describe('TreasuryController — main-wallet MFA bypass', () => {
  const ORIGINAL_ENV = process.env;

  let controller: TreasuryController;
  let twoFaService: { verifyOtp: jest.Mock };
  let systemConfigService: { isTreasuryWalletTotpRequired: jest.Mock };
  let importUseCase: { execute: jest.Mock };
  let revealUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ONCHAIN_OPERATOR_MODE;

    twoFaService = { verifyOtp: jest.fn() };
    systemConfigService = {
      isTreasuryWalletTotpRequired: jest.fn().mockResolvedValue(true),
    };
    importUseCase = { execute: jest.fn().mockResolvedValue({ wallet_id: 'w1' }) };
    revealUseCase = { execute: jest.fn().mockResolvedValue('pk-secret') };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TreasuryController],
      providers: [
        { provide: GetMainWalletQuery, useValue: {} },
        { provide: GetTransactionWalletQuery, useValue: {} },
        { provide: GetTreasuryOperationQuery, useValue: {} },
        { provide: ImportMainWalletUseCase, useValue: importUseCase },
        { provide: ApproveMainWalletUseCase, useValue: {} },
        { provide: RejectMainWalletUseCase, useValue: {} },
        { provide: SetDefaultMainWalletUseCase, useValue: {} },
        { provide: RevealMainWalletPrivateKeyUseCase, useValue: revealUseCase },
        { provide: UpdateMainWalletLabelUseCase, useValue: {} },
        { provide: RequestMainWalletDeletionUseCase, useValue: {} },
        { provide: ApproveMainWalletDeletionUseCase, useValue: {} },
        { provide: RejectMainWalletDeletionUseCase, useValue: {} },
        { provide: CreateTransactionWalletUseCase, useValue: {} },
        { provide: DeleteTransactionWalletUseCase, useValue: {} },
        { provide: SetDefaultUserDepositUseCase, useValue: {} },
        { provide: UnsetDefaultUserDepositUseCase, useValue: {} },
        { provide: TreasuryOperationsService, useValue: {} },
        { provide: TwoFaService, useValue: twoFaService },
        { provide: OnchainChainPickerService, useValue: {} },
        { provide: SystemConfigService, useValue: systemConfigService },
      ],
    }).compile();

    controller = moduleRef.get(TreasuryController);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('importMainWallet', () => {
    const dto: any = {
      chain: 'TRON_MAINNET',
      privateKey: 'a'.repeat(64),
      label: 'lbl',
      mfaCode: '123456',
    };

    it('verifies TOTP when flag is enabled (sandbox, default)', async () => {
      systemConfigService.isTreasuryWalletTotpRequired.mockResolvedValue(true);
      twoFaService.verifyOtp.mockResolvedValue(true);

      await controller.importMainWallet(dto, 'u1', 'ADMIN' as any);

      expect(twoFaService.verifyOtp).toHaveBeenCalledWith('u1', '123456');
      expect(importUseCase.execute).toHaveBeenCalled();
    });

    it('rejects with INVALID_MFA_CODE when TOTP flag is on but the code is bad', async () => {
      systemConfigService.isTreasuryWalletTotpRequired.mockResolvedValue(true);
      twoFaService.verifyOtp.mockResolvedValue(false);

      await expect(controller.importMainWallet(dto, 'u1', 'ADMIN' as any)).rejects.toMatchObject({
        code: 'INVALID_MFA_CODE',
      });
      expect(importUseCase.execute).not.toHaveBeenCalled();
    });

    it('skips TOTP entirely when admin disabled the flag in sandbox', async () => {
      systemConfigService.isTreasuryWalletTotpRequired.mockResolvedValue(false);

      await controller.importMainWallet({ ...dto, mfaCode: undefined }, 'u1', 'ADMIN' as any);

      expect(twoFaService.verifyOtp).not.toHaveBeenCalled();
      expect(importUseCase.execute).toHaveBeenCalled();
    });
  });

  describe('revealMainWalletPrivateKey', () => {
    const dto: any = { mfaCode: '123456' };

    it('verifies TOTP when flag is enabled', async () => {
      systemConfigService.isTreasuryWalletTotpRequired.mockResolvedValue(true);
      twoFaService.verifyOtp.mockResolvedValue(true);

      const result = await controller.revealMainWalletPrivateKey('mw-1', dto, 'u1');

      expect(twoFaService.verifyOtp).toHaveBeenCalledWith('u1', '123456');
      expect(revealUseCase.execute).toHaveBeenCalledWith('mw-1', 'u1');
      expect(result).toBe('pk-secret');
    });

    it('skips TOTP entirely when admin disabled the flag in sandbox', async () => {
      systemConfigService.isTreasuryWalletTotpRequired.mockResolvedValue(false);

      const result = await controller.revealMainWalletPrivateKey(
        'mw-1',
        { mfaCode: undefined },
        'u1',
      );

      expect(twoFaService.verifyOtp).not.toHaveBeenCalled();
      expect(revealUseCase.execute).toHaveBeenCalledWith('mw-1', 'u1');
      expect(result).toBe('pk-secret');
    });

    it('rejects with INVALID_MFA_CODE when TOTP flag is on but the code is bad', async () => {
      systemConfigService.isTreasuryWalletTotpRequired.mockResolvedValue(true);
      twoFaService.verifyOtp.mockResolvedValue(false);

      await expect(
        controller.revealMainWalletPrivateKey('mw-1', dto, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(revealUseCase.execute).not.toHaveBeenCalled();
    });
  });
});