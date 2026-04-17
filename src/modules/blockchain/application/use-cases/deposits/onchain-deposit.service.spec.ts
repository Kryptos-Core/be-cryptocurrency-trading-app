import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  BlockchainNetwork,
  OnchainTxStatus,
  WalletReferenceType,
  WalletTransactionAction,
} from '@/common/enums';
import { BadRequestException, ConflictException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { UnitOfWork } from '@/common/unit-of-work/unit-of-work';
import { ManagedWalletsService } from '@/modules/managed-wallets/managed-wallets.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { BlockchainProviderFactory } from '../../../blockchain-provider.factory';
import { DepositFxService } from '../../../domain/services/deposit-fx.service';
import { ONCHAIN_TRANSACTION_REPOSITORY } from '../../../domain/ports';
import { WalletLinkingService } from '../wallet-linking/wallet-linking.service';
import { OnchainDepositService } from './onchain-deposit.service';

describe('OnchainDepositService', () => {
  const onchainTxRepo = {
    findByChainAndTxHash: jest.fn(),
    create: jest.fn(),
    createWithinTransaction: jest.fn(),
    updateCreditConversion: jest.fn(),
    updateCreditConversionWithinTransaction: jest.fn(),
    findByIdAndUserId: jest.fn(),
    updateStatus: jest.fn(),
    updateStatusWithinTransaction: jest.fn(),
  };
  const dataSource = {
    query: jest.fn(),
  };
  const cacheService = {
    exists: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };
  const provider = {
    getTransactionStatus: jest.fn(),
    resolveDepositTransfers: jest.fn(),
  };
  const providerFactory = {
    getProvider: jest.fn().mockReturnValue(provider),
  };
  const walletLinkingService = {
    findVerifiedWallet: jest.fn(),
  };
  const depositFxService = {
    convertToPlatformCash: jest.fn(),
  };
  const walletsService = {
    applyTransaction: jest.fn(),
  };
  const managedWalletsService = {
    getPublicDepositRecipientAddress: jest.fn(),
  };

  const unitOfWork = {
    run: jest.fn(),
  };

  const outboxAppender = {
    append: jest.fn().mockResolvedValue(undefined),
  };

  let service: OnchainDepositService;

  const ethResolvedPending = {
    chain: BlockchainNetwork.ETH_MAINNET,
    txHash: '0xtx',
    logIndex: 0,
    from: '0xsender',
    to: '0xdeposit',
    amountHuman: '1.25',
    asset: 'NATIVE' as const,
    chainStatus: 'PENDING' as const,
    confirmations: 2,
  };

  const ethResolvedConfirmed = {
    ...ethResolvedPending,
    txHash: '0xconfirmed',
    amountHuman: '2.5',
    chainStatus: 'CONFIRMED' as const,
    confirmations: 12,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    managedWalletsService.getPublicDepositRecipientAddress.mockResolvedValue('0xdeposit');
    unitOfWork.run.mockImplementation(async (fn: (ctx: { query: typeof dataSource.query }) => Promise<unknown>) => {
      const ctx = {
        query: (...args: unknown[]) => (dataSource as any).query(...args),
      };
      return fn(ctx as any);
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnchainDepositService,
        { provide: ONCHAIN_TRANSACTION_REPOSITORY, useValue: onchainTxRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: CacheService, useValue: cacheService },
        { provide: BlockchainProviderFactory, useValue: providerFactory },
        { provide: WalletLinkingService, useValue: walletLinkingService },
        { provide: DepositFxService, useValue: depositFxService },
        { provide: WalletsService, useValue: walletsService },
        { provide: ManagedWalletsService, useValue: managedWalletsService },
        { provide: UnitOfWork, useValue: unitOfWork },
        { provide: OutboxAppender, useValue: outboxAppender },
      ],
    }).compile();

    service = moduleRef.get(OnchainDepositService);
  });

  it('submitDeposit creates a confirming tx without settling when chain tx is still pending', async () => {
    cacheService.exists.mockResolvedValue(false);
    onchainTxRepo.findByChainAndTxHash.mockResolvedValue(null);
    provider.resolveDepositTransfers.mockResolvedValue([ethResolvedPending]);
    walletLinkingService.findVerifiedWallet.mockResolvedValue({ link_id: 'link-1' });

    const result = await service.submitDeposit('user-1', {
      chain: BlockchainNetwork.ETH_MAINNET,
      txHash: '0xtx',
      amount: '1.25',
    } as any);

    expect(provider.resolveDepositTransfers).toHaveBeenCalledWith('0xtx', {
      expectedDepositAddress: '0xdeposit',
    });
    expect(onchainTxRepo.createWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        user_id: 'user-1',
        linked_wallet_id: 'link-1',
        tx_hash: '0xtx',
        status: OnchainTxStatus.CONFIRMING,
        confirmations: 2,
      }),
    );
    expect(walletsService.applyTransaction).not.toHaveBeenCalled();
    expect(outboxAppender.append).toHaveBeenCalled();
    expect(cacheService.delete).toHaveBeenCalledWith(
      `deposit:pending:${BlockchainNetwork.ETH_MAINNET}:0xtx:0`,
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: OnchainTxStatus.CONFIRMING,
        amount: '1.25',
        chain: BlockchainNetwork.ETH_MAINNET,
        settled: false,
      }),
    );
  });

  it('submitDeposit settles immediately for confirmed tx and records credit conversion', async () => {
    cacheService.exists.mockResolvedValue(false);
    onchainTxRepo.findByChainAndTxHash.mockResolvedValue(null);
    provider.resolveDepositTransfers.mockResolvedValue([ethResolvedConfirmed]);
    walletLinkingService.findVerifiedWallet.mockResolvedValue({ link_id: 'link-2' });
    depositFxService.convertToPlatformCash.mockResolvedValue({
      creditCurrencyId: 'usdt',
      creditAmount: '250',
      conversionRate: '100',
    });
    dataSource.query.mockResolvedValue([]);

    const result = await service.submitDeposit('user-2', {
      chain: BlockchainNetwork.ETH_MAINNET,
      txHash: '0xconfirmed',
      amount: '2.5',
    } as any);

    expect(depositFxService.convertToPlatformCash).toHaveBeenCalledWith(
      BlockchainNetwork.ETH_MAINNET,
      '2.5',
      'NATIVE',
    );
    expect(walletsService.applyTransaction).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({
        currencyId: 'usdt',
        action: WalletTransactionAction.CREDIT,
        amount: '250',
        refType: WalletReferenceType.EXTERNAL_DEPOSIT,
      }),
      expect.anything(),
    );
    expect(onchainTxRepo.updateCreditConversionWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'usdt',
      '250',
      '100',
    );
    expect(result.status).toBe(OnchainTxStatus.COMPLETED);
    expect(result.settled).toBe(true);
  });

  it('submitDeposit rejects duplicate processing locks and existing txs', async () => {
    const legDup = { ...ethResolvedPending, txHash: '0xdup' };
    provider.resolveDepositTransfers.mockResolvedValue([legDup]);
    walletLinkingService.findVerifiedWallet.mockResolvedValue({ link_id: 'link-1' });

    cacheService.exists.mockResolvedValue(true);
    await expect(
      service.submitDeposit('user-1', {
        chain: BlockchainNetwork.ETH_MAINNET,
        txHash: '0xdup',
        amount: '1',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    const legExisting = { ...ethResolvedPending, txHash: '0xdup-existing' };
    provider.resolveDepositTransfers.mockResolvedValue([legExisting]);
    cacheService.exists.mockResolvedValue(false);
    onchainTxRepo.findByChainAndTxHash.mockResolvedValue({ tx_id: 'existing' });

    await expect(
      service.submitDeposit('user-1', {
        chain: BlockchainNetwork.ETH_MAINNET,
        txHash: '0xdup-existing',
        amount: '1',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('settleDepositByTxId marks failed chain tx and skips wallet credit', async () => {
    onchainTxRepo.findByIdAndUserId.mockResolvedValue({
      tx_id: 'tx-fail',
      user_id: 'user-1',
      type: 'DEPOSIT',
      chain: BlockchainNetwork.ETH_MAINNET,
      tx_hash: '0xfail',
      log_index: 0,
      amount: '3',
      from_address: '0xsender',
      to_address: '0xdeposit',
    });
    managedWalletsService.getPublicDepositRecipientAddress.mockResolvedValue('0xdeposit');
    provider.resolveDepositTransfers.mockResolvedValue([]);
    provider.getTransactionStatus.mockResolvedValue({
      status: 'FAILED',
      confirmations: 7,
    });

    const result = await service.settleDepositByTxId('user-1', 'tx-fail');

    expect(onchainTxRepo.updateStatus).toHaveBeenCalledWith('tx-fail', OnchainTxStatus.FAILED, {
      confirmations: 7,
    });
    expect(walletsService.applyTransaction).not.toHaveBeenCalled();
    expect(result).toEqual({
      txId: 'tx-fail',
      status: OnchainTxStatus.FAILED,
      settled: false,
      confirmations: 7,
    });
  });

  it('settleDepositByTxId confirms and credits ledger once tx reaches confirmed state', async () => {
    onchainTxRepo.findByIdAndUserId.mockResolvedValue({
      tx_id: 'tx-ok',
      user_id: 'user-9',
      type: 'DEPOSIT',
      chain: BlockchainNetwork.ETH_MAINNET,
      tx_hash: '0xok',
      log_index: 0,
      amount: '4.2',
      from_address: '0xsender',
      to_address: '0xdeposit',
    });
    provider.resolveDepositTransfers.mockResolvedValue([
      {
        chain: BlockchainNetwork.ETH_MAINNET,
        txHash: '0xok',
        logIndex: 0,
        from: '0xsender',
        to: '0xdeposit',
        amountHuman: '4.2',
        asset: 'NATIVE' as const,
        chainStatus: 'CONFIRMED' as const,
        confirmations: 21,
      },
    ]);
    depositFxService.convertToPlatformCash.mockResolvedValue({
      creditCurrencyId: 'usdt',
      creditAmount: '420',
      conversionRate: '100',
    });
    dataSource.query.mockResolvedValue([]);

    const result = await service.settleDepositByTxId('user-9', 'tx-ok');

    expect(onchainTxRepo.updateStatusWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'tx-ok',
      OnchainTxStatus.COMPLETED,
      expect.objectContaining({ confirmations: 21, confirmed_at: expect.any(Date) }),
    );
    expect(walletsService.applyTransaction).toHaveBeenCalledWith(
      'user-9',
      expect.objectContaining({ currencyId: 'usdt', amount: '420' }),
      expect.anything(),
    );
    expect(onchainTxRepo.updateCreditConversionWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'tx-ok',
      'usdt',
      '420',
      '100',
    );
    expect(outboxAppender.append).toHaveBeenCalled();
    expect(result).toEqual({
      txId: 'tx-ok',
      status: OnchainTxStatus.COMPLETED,
      settled: true,
      confirmations: 21,
    });
  });

  it('submitDeposit rejects when resolved legs are empty but tx exists', async () => {
    cacheService.exists.mockResolvedValue(false);
    onchainTxRepo.findByChainAndTxHash.mockResolvedValue(null);
    managedWalletsService.getPublicDepositRecipientAddress.mockResolvedValue('Tconfigured');
    provider.resolveDepositTransfers.mockResolvedValue([]);
    provider.getTransactionStatus.mockResolvedValue({
      status: 'PENDING',
      confirmations: 1,
      from: 'Tsender',
      to: 'Twrong',
      value: '10',
    });

    await expect(
      service.submitDeposit('user-tron', {
        chain: BlockchainNetwork.TRON_MAINNET,
        txHash: 'tron-hash',
        amount: '10',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
