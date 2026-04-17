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
import { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { DepositFxService } from '../../../domain/services/deposit-fx.service';
import { WalletLinkingService } from '../wallet-linking/wallet-linking.service';
import { OnchainDepositService } from './application/use-cases/deposits/onchain-deposit.service';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import { ONCHAIN_TRANSACTION_REPOSITORY } from './domain/ports';

describe('OnchainDepositService', () => {
  const onchainTxRepo = {
    findByChainAndTxHash: jest.fn(),
    create: jest.fn(),
    updateCreditConversion: jest.fn(),
    findByIdAndUserId: jest.fn(),
    updateStatus: jest.fn(),
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
  const transactionWalletService = {
    getDefaultUserDepositWallet: jest.fn(),
  };

  let service: OnchainDepositService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
        { provide: TransactionWalletService, useValue: transactionWalletService },
      ],
    }).compile();

    service = moduleRef.get(OnchainDepositService);
  });

  it('submitDeposit creates a confirming tx without settling when chain tx is still pending', async () => {
    cacheService.exists.mockResolvedValue(false);
    onchainTxRepo.findByChainAndTxHash.mockResolvedValue(null);
    provider.getTransactionStatus.mockResolvedValue({
      status: 'PENDING',
      confirmations: 2,
      from: '0xsender',
      to: '0xdeposit',
      value: '1.25',
    });
    walletLinkingService.findVerifiedWallet.mockResolvedValue({ link_id: 'link-1' });

    const result = await service.submitDeposit('user-1', {
      chain: BlockchainNetwork.ETH_MAINNET,
      txHash: '0xtx',
      amount: '1.25',
    } as any);

    expect(onchainTxRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        linked_wallet_id: 'link-1',
        tx_hash: '0xtx',
        status: OnchainTxStatus.CONFIRMING,
        confirmations: 2,
      }),
    );
    expect(walletsService.applyTransaction).not.toHaveBeenCalled();
    expect(cacheService.delete).toHaveBeenCalledWith('deposit:pending:0xtx');
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
    provider.getTransactionStatus.mockResolvedValue({
      status: 'CONFIRMED',
      confirmations: 12,
      from: '0xsender',
      to: '0xdeposit',
      value: '2.5',
    });
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

    expect(walletsService.applyTransaction).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({
        currencyId: 'usdt',
        action: WalletTransactionAction.CREDIT,
        amount: '250',
        refType: WalletReferenceType.EXTERNAL_DEPOSIT,
      }),
    );
    expect(onchainTxRepo.updateCreditConversion).toHaveBeenCalledWith(
      expect.any(String),
      'usdt',
      '250',
      '100',
    );
    expect(result.status).toBe(OnchainTxStatus.COMPLETED);
    expect(result.settled).toBe(true);
  });

  it('submitDeposit rejects duplicate processing locks and existing txs', async () => {
    cacheService.exists.mockResolvedValue(true);

    await expect(
      service.submitDeposit('user-1', {
        chain: BlockchainNetwork.ETH_MAINNET,
        txHash: '0xdup',
        amount: '1',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);

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
      amount: '3',
    });
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
      amount: '4.2',
    });
    provider.getTransactionStatus.mockResolvedValue({
      status: 'CONFIRMED',
      confirmations: 21,
    });
    depositFxService.convertToPlatformCash.mockResolvedValue({
      creditCurrencyId: 'usdt',
      creditAmount: '420',
      conversionRate: '100',
    });
    dataSource.query.mockResolvedValue([]);

    const result = await service.settleDepositByTxId('user-9', 'tx-ok');

    expect(onchainTxRepo.updateStatus).toHaveBeenCalledWith(
      'tx-ok',
      OnchainTxStatus.COMPLETED,
      expect.objectContaining({ confirmations: 21, confirmed_at: expect.any(Date) }),
    );
    expect(walletsService.applyTransaction).toHaveBeenCalledWith(
      'user-9',
      expect.objectContaining({ currencyId: 'usdt', amount: '420' }),
    );
    expect(onchainTxRepo.updateCreditConversion).toHaveBeenCalledWith(
      'tx-ok',
      'usdt',
      '420',
      '100',
    );
    expect(result).toEqual({
      txId: 'tx-ok',
      status: OnchainTxStatus.COMPLETED,
      settled: true,
      confirmations: 21,
    });
  });

  it('submitDeposit enforces Tron recipient default wallet check', async () => {
    cacheService.exists.mockResolvedValue(false);
    onchainTxRepo.findByChainAndTxHash.mockResolvedValue(null);
    provider.getTransactionStatus.mockResolvedValue({
      status: 'PENDING',
      confirmations: 1,
      from: 'Tsender',
      to: 'Tactual',
      value: '10',
    });
    transactionWalletService.getDefaultUserDepositWallet.mockResolvedValue({
      address: 'Tconfigured',
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
