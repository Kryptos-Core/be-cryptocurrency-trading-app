import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import {
  BlockchainNetwork,
  OnchainTxStatus,
  OnchainTxType,
  WalletReferenceType,
  WalletTransactionAction,
} from '@/common/enums';
import { ConflictException } from '@/common/exceptions';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { CacheService } from '@/common/services';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { UsersService } from '@/modules/users/users.service';
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from '@/modules/currencies/domain/ports';
import { USERS_REPOSITORY } from '@/modules/users';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { BlockchainProviderFactory } from '../../../blockchain-provider.factory';
import { ONCHAIN_TRANSACTION_REPOSITORY, type OnchainTransactionRepositoryPort } from '../../../domain/ports';
import { WalletLinkingService } from '../wallet-linking/wallet-linking.service';
import { OnchainWithdrawalService } from './onchain-withdrawal.service';
import { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';

const USER_ID = 'user-123';
const WALLET_ID = 'wallet-link-456';
const ADDRESS = 'TRx1234567890abcdef';

function makeMockCurrencyRepo() {
  return {
    findBySymbol: jest.fn(),
  };
}

function makeMockOnchainTxRepo() {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    findPendingWithdrawals: jest.fn(),
    findConfirmingWithdrawals: jest.fn(),
    markOrphanConfirmingAsFailed: jest.fn(),
    setHighRiskFlag: jest.fn(),
  };
}

function makeMockUsersRepo() {
  return {
    findById: jest.fn(),
  };
}

function makeMockCacheService() {
  return {
    exists: jest.fn().mockResolvedValue(false),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };
}

function makeMockSystemConfig() {
  return {
    get: jest.fn().mockImplementation(async (key: string) => {
      if (key === 'fraud.withdrawal_daily_limit_usd') return '50000';
      if (key === 'fraud.recent_wallet_link_hours') return '24';
      if (key === 'fraud.high_amount_threshold_usd') return '10000';
      return null;
    }),
  };
}

function makeMockWalletsService() {
  return {
    applyTransaction: jest.fn(),
    getBalance: jest.fn(),
  };
}

function makeMockNotificationsService() {
  return {
    sendToUsers: jest.fn(),
    sendToUser: jest.fn(),
  };
}

function makeMockUsersService() {
  return {
    findActiveUsersByRole: jest.fn().mockResolvedValue([]),
  };
}

function makeMockProviderFactory() {
  return {
    getProvider: jest.fn(),
  };
}

function makeMockWalletLinkingService() {
  return {
    getLinkedWallet: jest.fn(),
    getLinkedWallets: jest.fn(),
    requestLink: jest.fn(),
    verifyLink: jest.fn(),
    findVerifiedWallet: jest.fn(),
    findVerifiedWalletByChainAndAddress: jest.fn(),
  };
}

describe('OnchainWithdrawalService — Fraud Detection', () => {
  let withdrawalService: OnchainWithdrawalService;
  let onchainTxRepo: ReturnType<typeof makeMockOnchainTxRepo>;
  let currencyRepo: ReturnType<typeof makeMockCurrencyRepo>;
  let usersRepo: ReturnType<typeof makeMockUsersRepo>;
  let walletLinkingService: ReturnType<typeof makeMockWalletLinkingService>;

  beforeEach(async () => {
    onchainTxRepo = makeMockOnchainTxRepo();
    currencyRepo = makeMockCurrencyRepo();
    usersRepo = makeMockUsersRepo();
    usersRepo.findById.mockResolvedValue({ user_id: USER_ID, email: 'user@example.com', role: 'USER' });
    currencyRepo.findBySymbol.mockResolvedValue({ currency_id: 'usdt-id', symbol: 'USDT', name: 'Tether USD', decimals: 18, min_withdrawal: '1', is_active: true, created_at: new Date(), updated_at: new Date() });
    const cacheService = makeMockCacheService();
    const systemConfig = makeMockSystemConfig();
    const walletsService = makeMockWalletsService();
    const notificationsService = makeMockNotificationsService();
    const usersService = makeMockUsersService();
    const providerFactory = makeMockProviderFactory();
    walletLinkingService = makeMockWalletLinkingService();

    const module = await Test.createTestingModule({
      providers: [
        OnchainWithdrawalService,
        { provide: ONCHAIN_TRANSACTION_REPOSITORY, useValue: onchainTxRepo },
        { provide: CURRENCY_REPOSITORY, useValue: currencyRepo },
        { provide: USERS_REPOSITORY, useValue: usersRepo },
        { provide: CacheService, useValue: cacheService },
        { provide: SystemConfigService, useValue: systemConfig },
        { provide: WalletsService, useValue: walletsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: UsersService, useValue: usersService },
        { provide: BlockchainProviderFactory, useValue: providerFactory },
        { provide: WalletLinkingService, useValue: walletLinkingService },
        { provide: TransactionWalletService, useValue: {} },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } },
      ],
    }).compile();

    withdrawalService = module.get(OnchainWithdrawalService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function buildValidRequest(overrides: Partial<Parameters<typeof walletLinkingService.getLinkedWallet.mock.calls[0]>[0]> = {}) {
    walletLinkingService.getLinkedWallet.mockResolvedValue({
      link_id: WALLET_ID,
      user_id: USER_ID,
      address: ADDRESS,
      chain: BlockchainNetwork.TRON_MAINNET,
      linked_at: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago — safe
      status: 'VERIFIED',
    });
    onchainTxRepo.findPendingWithdrawals.mockResolvedValue([]);
  }

  // --- RECENTLY_LINKED_WALLET fraud flag ---

  describe('fraud: RECENTLY_LINKED_WALLET flag', () => {
    it('sets RECENTLY_LINKED_WALLET flag when wallet was linked within 24h', async () => {
      // Wallet linked only 1 hour ago
      walletLinkingService.getLinkedWallet.mockResolvedValue({
        link_id: WALLET_ID,
        user_id: USER_ID,
        address: ADDRESS,
        chain: BlockchainNetwork.TRON_MAINNET,
        linked_at: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago
        status: 'VERIFIED',
      });
      onchainTxRepo.findPendingWithdrawals.mockResolvedValue([]);

      await withdrawalService.requestWithdrawal(USER_ID, {
        linkedWalletId: WALLET_ID,
        amount: '100',
        chain: BlockchainNetwork.TRON_MAINNET,
      });

      expect(onchainTxRepo.setHighRiskFlag).toHaveBeenCalledWith(
        expect.any(String),
        'RECENTLY_LINKED_WALLET',
      );
    });

    it('does NOT flag when wallet was linked more than 24h ago', async () => {
      walletLinkingService.getLinkedWallet.mockResolvedValue({
        link_id: WALLET_ID,
        user_id: USER_ID,
        address: ADDRESS,
        chain: BlockchainNetwork.TRON_MAINNET,
        linked_at: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
        status: 'VERIFIED',
      });
      onchainTxRepo.findPendingWithdrawals.mockResolvedValue([]);

      await withdrawalService.requestWithdrawal(USER_ID, {
        linkedWalletId: WALLET_ID,
        amount: '100',
        chain: BlockchainNetwork.TRON_MAINNET,
      });

      // setHighRiskFlag should not be called for RECENTLY_LINKED_WALLET
      const flagCalls = onchainTxRepo.setHighRiskFlag.mock.calls.filter(
        (call) => call[1] === 'RECENTLY_LINKED_WALLET',
      );
      expect(flagCalls).toHaveLength(0);
    });

    it('does NOT flag when linked_at is null', async () => {
      walletLinkingService.getLinkedWallet.mockResolvedValue({
        link_id: WALLET_ID,
        user_id: USER_ID,
        address: ADDRESS,
        chain: BlockchainNetwork.TRON_MAINNET,
        linked_at: null,
        status: 'VERIFIED',
      });
      onchainTxRepo.findPendingWithdrawals.mockResolvedValue([]);

      await withdrawalService.requestWithdrawal(USER_ID, {
        linkedWalletId: WALLET_ID,
        amount: '100',
        chain: BlockchainNetwork.TRON_MAINNET,
      });

      const flagCalls = onchainTxRepo.setHighRiskFlag.mock.calls.filter(
        (call) => call[1] === 'RECENTLY_LINKED_WALLET',
      );
      expect(flagCalls).toHaveLength(0);
    });

    it('flags at exactly 24h boundary — 23h59m should flag', async () => {
      walletLinkingService.getLinkedWallet.mockResolvedValue({
        link_id: WALLET_ID,
        user_id: USER_ID,
        address: ADDRESS,
        chain: BlockchainNetwork.TRON_MAINNET,
        linked_at: new Date(Date.now() - 23 * 60 * 60 * 1000 - 59 * 60 * 1000), // 23h59m ago
        status: 'VERIFIED',
      });
      onchainTxRepo.findPendingWithdrawals.mockResolvedValue([]);

      await withdrawalService.requestWithdrawal(USER_ID, {
        linkedWalletId: WALLET_ID,
        amount: '100',
        chain: BlockchainNetwork.TRON_MAINNET,
      });

      expect(onchainTxRepo.setHighRiskFlag).toHaveBeenCalledWith(
        expect.any(String),
        'RECENTLY_LINKED_WALLET',
      );
    });
  });

  // --- MULTIPLE_PENDING_WITHDRAWALS fraud flag ---

  describe('fraud: MULTIPLE_PENDING_WITHDRAWALS flag', () => {
    it('sets MULTIPLE_PENDING_WITHDRAWALS flag when user has pending withdrawals today', async () => {
      await buildValidRequest();
      const yesterday = new Date();
      yesterday.setHours(0, 0, 0, 0);

      onchainTxRepo.findPendingWithdrawals.mockResolvedValue([
        {
          tx_id: 'existing-tx-1',
          user_id: USER_ID,
          type: OnchainTxType.WITHDRAWAL,
          status: OnchainTxStatus.PENDING,
          created_at: new Date(), // today
        },
      ]);

      await withdrawalService.requestWithdrawal(USER_ID, {
        linkedWalletId: WALLET_ID,
        amount: '50',
        chain: BlockchainNetwork.TRON_MAINNET,
      });

      expect(onchainTxRepo.setHighRiskFlag).toHaveBeenCalledWith(
        expect.any(String),
        'MULTIPLE_PENDING_WITHDRAWALS',
      );
    });

    it('does NOT flag when user has no pending withdrawals today', async () => {
      await buildValidRequest();
      onchainTxRepo.findPendingWithdrawals.mockResolvedValue([]);

      await withdrawalService.requestWithdrawal(USER_ID, {
        linkedWalletId: WALLET_ID,
        amount: '50',
        chain: BlockchainNetwork.TRON_MAINNET,
      });

      const flagCalls = onchainTxRepo.setHighRiskFlag.mock.calls.filter(
        (call) => call[1] === 'MULTIPLE_PENDING_WITHDRAWALS',
      );
      expect(flagCalls).toHaveLength(0);
    });

    it('flags for other users pending withdrawals (same user check)', async () => {
      await buildValidRequest();
      onchainTxRepo.findPendingWithdrawals.mockResolvedValue([
        {
          tx_id: 'other-user-tx',
          user_id: 'other-user-999',
          type: OnchainTxType.WITHDRAWAL,
          status: OnchainTxStatus.PENDING,
          created_at: new Date(),
        },
      ]);

      await withdrawalService.requestWithdrawal(USER_ID, {
        linkedWalletId: WALLET_ID,
        amount: '50',
        chain: BlockchainNetwork.TRON_MAINNET,
      });

      // Should NOT flag because the pending withdrawal belongs to a different user
      const flagCalls = onchainTxRepo.setHighRiskFlag.mock.calls.filter(
        (call) => call[1] === 'MULTIPLE_PENDING_WITHDRAWALS',
      );
      expect(flagCalls).toHaveLength(0);
    });
  });

  // --- Both flags together ---

  describe('fraud: both flags can be set simultaneously', () => {
    it('sets both RECENTLY_LINKED_WALLET and MULTIPLE_PENDING flags when both conditions are true', async () => {
      walletLinkingService.getLinkedWallet.mockResolvedValue({
        link_id: WALLET_ID,
        user_id: USER_ID,
        address: ADDRESS,
        chain: BlockchainNetwork.TRON_MAINNET,
        linked_at: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago
        status: 'VERIFIED',
      });
      onchainTxRepo.findPendingWithdrawals.mockResolvedValue([
        {
          tx_id: 'pending-tx',
          user_id: USER_ID,
          type: OnchainTxType.WITHDRAWAL,
          status: OnchainTxStatus.PENDING,
          created_at: new Date(),
        },
      ]);

      await withdrawalService.requestWithdrawal(USER_ID, {
        linkedWalletId: WALLET_ID,
        amount: '100',
        chain: BlockchainNetwork.TRON_MAINNET,
      });

      const flagCalls = onchainTxRepo.setHighRiskFlag.mock.calls.map((call) => call[1]);
      expect(flagCalls).toContain('RECENTLY_LINKED_WALLET');
      expect(flagCalls).toContain('MULTIPLE_PENDING_WITHDRAWALS');
      expect(flagCalls).toHaveLength(2);
    });
  });

  // --- Unverified email block ---

  describe('security: unverified email blocks withdrawal', () => {
    it('throws ConflictException when user has placeholder email', async () => {
      walletLinkingService.getLinkedWallet.mockResolvedValue({
        link_id: WALLET_ID,
        user_id: USER_ID,
        address: ADDRESS,
        chain: BlockchainNetwork.TRON_MAINNET,
        linked_at: null,
        status: 'VERIFIED',
      });
      onchainTxRepo.findPendingWithdrawals.mockResolvedValue([]);

      // Override usersRepo to return placeholder email
      const module = await Test.createTestingModule({
        providers: [
          OnchainWithdrawalService,
          { provide: ONCHAIN_TRANSACTION_REPOSITORY, useValue: onchainTxRepo },
          {
            provide: CURRENCY_REPOSITORY,
            useValue: {
              findBySymbol: jest.fn().mockResolvedValue({
                currency_id: 'usdt-id',
                symbol: 'USDT',
                name: 'Tether USD',
                decimals: 18,
                min_withdrawal: '1',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date(),
              }),
            },
          },
          {
            provide: USERS_REPOSITORY,
            useValue: {
              findById: jest.fn().mockResolvedValue({
                user_id: USER_ID,
                email: 'wallet_placeholder_abc123@placeholder.wallet',
                role: 'USER',
              }),
            },
          },
          { provide: CacheService, useValue: makeMockCacheService() },
          { provide: SystemConfigService, useValue: makeMockSystemConfig() },
          { provide: WalletsService, useValue: makeMockWalletsService() },
          { provide: NotificationsService, useValue: makeMockNotificationsService() },
          { provide: UsersService, useValue: makeMockUsersService() },
          { provide: BlockchainProviderFactory, useValue: makeMockProviderFactory() },
          { provide: WalletLinkingService, useValue: walletLinkingService },
          { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } },
          { provide: TransactionWalletService, useValue: {} },
        ],
      }).compile();

      const svc = module.get(OnchainWithdrawalService);

      await expect(
        svc.requestWithdrawal(USER_ID, {
          linkedWalletId: WALLET_ID,
          amount: '100',
          chain: BlockchainNetwork.TRON_MAINNET,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows withdrawal when user has real email', async () => {
      await buildValidRequest();
      onchainTxRepo.findPendingWithdrawals.mockResolvedValue([]);

      // Override usersRepo to return real email
      const module = await Test.createTestingModule({
        providers: [
          OnchainWithdrawalService,
          { provide: ONCHAIN_TRANSACTION_REPOSITORY, useValue: onchainTxRepo },
          {
            provide: CURRENCY_REPOSITORY,
            useValue: {
              findBySymbol: jest.fn().mockResolvedValue({
                currency_id: 'usdt-id',
                symbol: 'USDT',
                name: 'Tether USD',
                decimals: 18,
                min_withdrawal: '1',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date(),
              }),
            },
          },
          {
            provide: USERS_REPOSITORY,
            useValue: {
              findById: jest.fn().mockResolvedValue({
                user_id: USER_ID,
                email: 'user@example.com',
                role: 'USER',
              }),
            },
          },
          { provide: CacheService, useValue: makeMockCacheService() },
          { provide: SystemConfigService, useValue: makeMockSystemConfig() },
          { provide: WalletsService, useValue: makeMockWalletsService() },
          { provide: NotificationsService, useValue: makeMockNotificationsService() },
          { provide: UsersService, useValue: makeMockUsersService() },
          { provide: BlockchainProviderFactory, useValue: makeMockProviderFactory() },
          { provide: WalletLinkingService, useValue: walletLinkingService },
          { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } },
          { provide: TransactionWalletService, useValue: {} },
        ],
      }).compile();

      const svc = module.get(OnchainWithdrawalService);

      await expect(
        svc.requestWithdrawal(USER_ID, {
          linkedWalletId: WALLET_ID,
          amount: '100',
          chain: BlockchainNetwork.TRON_MAINNET,
        }),
      ).resolves.not.toThrow();
    });
  });

  // --- Idempotency ---

  describe('idempotency prevents duplicate requests', () => {
    it('throws ConflictException when same idempotency key is used twice', async () => {
      const cacheService = makeMockCacheService();
      cacheService.exists.mockResolvedValueOnce(false); // first call — lock passes
      cacheService.exists.mockResolvedValueOnce(true); // second call — idempotency key exists

      const module = await Test.createTestingModule({
        providers: [
          OnchainWithdrawalService,
          { provide: ONCHAIN_TRANSACTION_REPOSITORY, useValue: onchainTxRepo },
          { provide: CURRENCY_REPOSITORY, useValue: makeMockCurrencyRepo() },
          { provide: USERS_REPOSITORY, useValue: makeMockUsersRepo() },
          { provide: CacheService, useValue: cacheService },
          { provide: SystemConfigService, useValue: makeMockSystemConfig() },
          { provide: WalletsService, useValue: makeMockWalletsService() },
          { provide: NotificationsService, useValue: makeMockNotificationsService() },
          { provide: UsersService, useValue: makeMockUsersService() },
          { provide: BlockchainProviderFactory, useValue: makeMockProviderFactory() },
          { provide: WalletLinkingService, useValue: walletLinkingService },
          { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } },
          { provide: TransactionWalletService, useValue: {} },
        ],
      }).compile();
      const svc = module.get(OnchainWithdrawalService);
      await buildValidRequest();

      await expect(
        svc.requestWithdrawal(USER_ID, {
          linkedWalletId: WALLET_ID,
          amount: '100',
          chain: BlockchainNetwork.TRON_MAINNET,
          idempotencyKey: 'idempotency-123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // --- Withdrawal lock ---

  describe('concurrent request lock prevents race conditions', () => {
    it('throws ConflictException when a withdrawal request is already in flight', async () => {
      const cacheService = makeMockCacheService();
      cacheService.exists.mockResolvedValue(true); // lock already exists

      const module = await Test.createTestingModule({
        providers: [
          OnchainWithdrawalService,
          { provide: ONCHAIN_TRANSACTION_REPOSITORY, useValue: onchainTxRepo },
          { provide: CURRENCY_REPOSITORY, useValue: makeMockCurrencyRepo() },
          { provide: USERS_REPOSITORY, useValue: makeMockUsersRepo() },
          { provide: CacheService, useValue: cacheService },
          { provide: SystemConfigService, useValue: makeMockSystemConfig() },
          { provide: WalletsService, useValue: makeMockWalletsService() },
          { provide: NotificationsService, useValue: makeMockNotificationsService() },
          { provide: UsersService, useValue: makeMockUsersService() },
          { provide: BlockchainProviderFactory, useValue: makeMockProviderFactory() },
          { provide: WalletLinkingService, useValue: walletLinkingService },
          { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } },
          { provide: TransactionWalletService, useValue: {} },
        ],
      }).compile();

      const svc = module.get(OnchainWithdrawalService);

      await expect(
        svc.requestWithdrawal(USER_ID, {
          linkedWalletId: WALLET_ID,
          amount: '100',
          chain: BlockchainNetwork.TRON_MAINNET,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
