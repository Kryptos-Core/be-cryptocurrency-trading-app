import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OnchainTransferService } from './onchain-transfer.service';
import { CacheService } from '@/common/services';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import { WalletLinkingService } from './wallet-linking.service';
import { DepositFxService } from './deposit-fx.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { CurrencyRepository } from '@/modules/currencies/repositories';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { BlockchainNetwork, OnchainTxStatus, WalletTransactionAction } from '@/common/enums';

describe('OnchainTransferService', () => {
  let service: OnchainTransferService;
  let dataSource: jest.Mocked<DataSource>;
  let cacheService: jest.Mocked<CacheService>;
  let providerFactory: jest.Mocked<BlockchainProviderFactory>;
  let walletLinkingService: jest.Mocked<WalletLinkingService>;
  let walletsService: jest.Mocked<WalletsService>;
  let currencyRepository: jest.Mocked<CurrencyRepository>;
  let configService: jest.Mocked<ConfigService>;
  let systemConfigService: jest.Mocked<Pick<SystemConfigService, 'get'>>;

  const provider = {
    getTransactionStatus: jest.fn(),
    sendTransaction: jest.fn(),
    getHotWalletAddress: jest.fn(),
  };

  beforeEach(async () => {
    const dataSourceMock = {
      query: jest.fn(),
    };
    const cacheMock = {
      get: jest.fn(),
      exists: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };
    const providerFactoryMock = {
      getProvider: jest.fn(),
    };
    const walletLinkingMock = {
      findByLinkId: jest.fn(),
      findVerifiedWallet: jest.fn(),
    };
    const walletsMock = {
      applyTransaction: jest.fn(),
    };
    const currencyRepoMock = {
      findBySymbol: jest.fn(),
    };
    const configMock = {
      get: jest.fn(),
    };

    const systemConfigMock = {
      get: jest.fn(),
    };

    const txWalletMock = {
      getWithdrawalSourceWallet: jest.fn().mockResolvedValue(null),
      sendWithdrawalNativeTransfer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnchainTransferService,
        { provide: DataSource, useValue: dataSourceMock },
        { provide: CacheService, useValue: cacheMock },
        { provide: BlockchainProviderFactory, useValue: providerFactoryMock },
        { provide: WalletLinkingService, useValue: walletLinkingMock },
        {
          provide: DepositFxService,
          useValue: {
            convertToPlatformCash: jest.fn().mockResolvedValue({
              creditCurrencyId: '019cecc4-2dc1-7dd9-ac3e-630f88893875',
              creditAmount: '2.5',
              conversionRate: '1',
              originalAmount: '2.5',
            }),
          },
        },
        { provide: WalletsService, useValue: walletsMock },
        { provide: CurrencyRepository, useValue: currencyRepoMock },
        { provide: ConfigService, useValue: configMock },
        { provide: SystemConfigService, useValue: systemConfigMock },
        { provide: NotificationsService, useValue: { sendToUser: jest.fn() } },
        { provide: TransactionWalletService, useValue: txWalletMock },
      ],
    }).compile();

    service = module.get(OnchainTransferService);
    dataSource = module.get(DataSource);
    cacheService = module.get(CacheService);
    providerFactory = module.get(BlockchainProviderFactory);
    walletLinkingService = module.get(WalletLinkingService);
    walletsService = module.get(WalletsService);
    currencyRepository = module.get(CurrencyRepository);
    configService = module.get(ConfigService);
    systemConfigService = module.get(SystemConfigService);

    providerFactory.getProvider.mockReturnValue(provider as any);
    provider.getHotWalletAddress.mockReturnValue('0xHotWallet');

    cacheService.get.mockResolvedValue(null);
    cacheService.exists.mockResolvedValue(false);
    cacheService.set.mockResolvedValue(undefined as never);
    cacheService.delete.mockResolvedValue(undefined as never);

    walletLinkingService.findByLinkId.mockResolvedValue({
      link_id: 'link-1',
      chain: BlockchainNetwork.ETH_SEPOLIA,
      address: '0xRecipient',
      status: 'VERIFIED',
    } as any);

    walletsService.applyTransaction.mockResolvedValue({} as any);

    currencyRepository.findBySymbol.mockResolvedValue({
      currency_id: '1',
      symbol: 'ETH',
    } as any);

    configService.get.mockImplementation((key: string) => {
      if (key === 'BLOCKCHAIN_WITHDRAW_AUTO_MAX') return '10';
      if (key === 'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL') return 'ETH';
      return undefined;
    });

    dataSource.query.mockResolvedValue([] as never);

    jest.clearAllMocks();

    systemConfigService.get.mockImplementation(async (key: string) => {
      if (key === 'BLOCKCHAIN_WITHDRAW_AUTO_MAX') return '10';
      if (key === 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_SEPOLIA') return null;
      if (key === 'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL') return 'ETH';
      return null;
    });
  });

  it('auto withdrawal success should freeze -> unfreeze -> debit', async () => {
    provider.sendTransaction.mockResolvedValue('0xhash-ok');

    const result = await service.requestWithdrawal('user-1', {
      chain: BlockchainNetwork.ETH_SEPOLIA,
      linkedWalletId: 'link-1',
      amount: '1',
      idempotencyKey: 'idem-1',
    });

    expect(result.status).toBe(OnchainTxStatus.CONFIRMING);
    expect(walletsService.applyTransaction).toHaveBeenCalledTimes(3);
    expect(walletsService.applyTransaction).toHaveBeenNthCalledWith(
      1,
      'user-1',
      expect.objectContaining({ action: WalletTransactionAction.FREEZE }),
    );
    expect(walletsService.applyTransaction).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({ action: WalletTransactionAction.UNFREEZE }),
    );
    expect(walletsService.applyTransaction).toHaveBeenNthCalledWith(
      3,
      'user-1',
      expect.objectContaining({ action: WalletTransactionAction.DEBIT }),
    );
  });

  it('auto withdrawal failed send should freeze -> unfreeze only', async () => {
    provider.sendTransaction.mockRejectedValue(new Error('send failed'));

    const result = await service.requestWithdrawal('user-1', {
      chain: BlockchainNetwork.ETH_SEPOLIA,
      linkedWalletId: 'link-1',
      amount: '1',
      idempotencyKey: 'idem-2',
    });

    expect(result.status).toBe(OnchainTxStatus.FAILED);
    expect(walletsService.applyTransaction).toHaveBeenCalledTimes(2);
    expect(walletsService.applyTransaction).toHaveBeenNthCalledWith(
      1,
      'user-1',
      expect.objectContaining({ action: WalletTransactionAction.FREEZE }),
    );
    expect(walletsService.applyTransaction).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({ action: WalletTransactionAction.UNFREEZE }),
    );
  });

  it('manual withdrawal should keep pending review and not send on-chain', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'BLOCKCHAIN_WITHDRAW_AUTO_MAX') return '0.5';
      if (key === 'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL') return 'ETH';
      return undefined;
    });
    systemConfigService.get.mockImplementation(async (key: string) => {
      if (key === 'BLOCKCHAIN_WITHDRAW_AUTO_MAX') return '0.5';
      if (key === 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_SEPOLIA') return null;
      if (key === 'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL') return 'ETH';
      return null;
    });

    const result = await service.requestWithdrawal('user-1', {
      chain: BlockchainNetwork.ETH_SEPOLIA,
      linkedWalletId: 'link-1',
      amount: '1',
      idempotencyKey: 'idem-3',
    });

    expect(result.reviewRequired).toBe(true);
    expect(result.status).toBe(OnchainTxStatus.PENDING);
    expect(provider.sendTransaction).not.toHaveBeenCalled();
    expect(walletsService.applyTransaction).toHaveBeenCalledTimes(1);
    expect(walletsService.applyTransaction).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ action: WalletTransactionAction.FREEZE }),
    );
  });

  it('idempotency cache should return cached result and skip side effects', async () => {
    cacheService.get.mockResolvedValue({
      txId: 'cached-tx',
      status: OnchainTxStatus.CONFIRMING,
      amount: '1',
      chain: BlockchainNetwork.ETH_SEPOLIA,
      toAddress: '0xRecipient',
    } as never);

    const result = await service.requestWithdrawal('user-1', {
      chain: BlockchainNetwork.ETH_SEPOLIA,
      linkedWalletId: 'link-1',
      amount: '1',
      idempotencyKey: 'idem-4',
    });

    expect(result.txId).toBe('cached-tx');
    expect(cacheService.exists).not.toHaveBeenCalled();
    expect(walletsService.applyTransaction).not.toHaveBeenCalled();
    expect(provider.sendTransaction).not.toHaveBeenCalled();
  });

  it('approveManualWithdrawal should unfreeze and debit when on-chain send succeeds', async () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM onchain_transactions') && sql.includes('WHERE tx_id = ?')) {
        return [
          {
            tx_id: 'tx-manual-1',
            user_id: 'user-1',
            chain: BlockchainNetwork.ETH_SEPOLIA,
            type: 'WITHDRAWAL',
            tx_hash: null,
            from_address: '0xHotWallet',
            to_address: '0xRecipient',
            amount: '1.25',
            status: OnchainTxStatus.PENDING,
          },
        ];
      }
      return [];
    });

    provider.sendTransaction.mockResolvedValue('0xmanualhash');

    const result = await service.approveManualWithdrawal('actor-1', 'tx-manual-1');

    expect(result.status).toBe(OnchainTxStatus.CONFIRMING);
    expect(walletsService.applyTransaction).toHaveBeenCalledTimes(2);
    expect(walletsService.applyTransaction).toHaveBeenNthCalledWith(
      1,
      'user-1',
      expect.objectContaining({ action: WalletTransactionAction.UNFREEZE }),
    );
    expect(walletsService.applyTransaction).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({ action: WalletTransactionAction.DEBIT }),
    );
  });

  it('rejectManualWithdrawal should unfreeze only and mark failed', async () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM onchain_transactions') && sql.includes('WHERE tx_id = ?')) {
        return [
          {
            tx_id: 'tx-manual-2',
            user_id: 'user-1',
            chain: BlockchainNetwork.ETH_SEPOLIA,
            type: 'WITHDRAWAL',
            tx_hash: null,
            amount: '0.75',
            status: OnchainTxStatus.PENDING,
          },
        ];
      }
      return [];
    });

    const result = await service.rejectManualWithdrawal('actor-1', 'tx-manual-2', 'risk rejected');

    expect(result.status).toBe(OnchainTxStatus.FAILED);
    expect(walletsService.applyTransaction).toHaveBeenCalledTimes(1);
    expect(walletsService.applyTransaction).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ action: WalletTransactionAction.UNFREEZE }),
    );
  });

  it('settleDepositByTxId should credit wallet once when tx becomes confirmed', async () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM onchain_transactions') && sql.includes('WHERE tx_id = ? AND user_id = ?')) {
        return [
          {
            tx_id: 'tx-dep-1',
            user_id: 'user-1',
            chain: BlockchainNetwork.ETH_SEPOLIA,
            type: 'DEPOSIT',
            tx_hash: '0xdep',
            amount: '2.5',
            status: OnchainTxStatus.CONFIRMING,
            confirmations: 2,
          },
        ];
      }
      if (sql.includes('FROM wallet_ledger')) {
        return [];
      }
      return [];
    });

    provider.getTransactionStatus.mockResolvedValue({
      txHash: '0xdep',
      network: BlockchainNetwork.ETH_SEPOLIA,
      status: 'CONFIRMED',
      confirmations: 12,
      from: '0xSender',
      to: '0xHotWallet',
      value: '2.5',
    });

    const result = await service.settleDepositByTxId('user-1', 'tx-dep-1');

    expect(result.status).toBe(OnchainTxStatus.COMPLETED);
    expect(result.settled).toBe(true);
    expect(walletsService.applyTransaction).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ action: WalletTransactionAction.CREDIT }),
    );
  });
});
