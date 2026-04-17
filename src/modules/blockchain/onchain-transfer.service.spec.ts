import { Test } from '@nestjs/testing';
import { BlockchainNetwork, OnchainTxStatus } from '@/common/enums';
import { OnchainTransferQueryService } from './application/queries/transactions/onchain-transfer-query.service';
import { OnchainDepositService } from './application/use-cases/deposits/onchain-deposit.service';
import { OnchainWithdrawalService } from './application/use-cases/withdrawals/onchain-withdrawal.service';
import { OnchainTransferService } from './onchain-transfer.service';

describe('OnchainTransferService', () => {
  let service: OnchainTransferService;
  const depositService = {
    previewDepositTx: jest.fn(),
    submitDeposit: jest.fn(),
    settleDepositByTxId: jest.fn(),
  };
  const withdrawalService = {
    requestWithdrawal: jest.fn(),
    approveManualWithdrawal: jest.fn(),
    rejectManualWithdrawal: jest.fn(),
    processPendingManualWithdrawals: jest.fn(),
  };
  const queryService = {
    getTransactions: jest.fn(),
    getTransactionById: jest.fn(),
    getAdminWithdrawals: jest.fn(),
    getAdminWithdrawalById: jest.fn(),
    getAdminWithdrawalStats: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OnchainTransferService,
        { provide: OnchainDepositService, useValue: depositService },
        { provide: OnchainWithdrawalService, useValue: withdrawalService },
        { provide: OnchainTransferQueryService, useValue: queryService },
      ],
    }).compile();

    service = moduleRef.get(OnchainTransferService);
  });

  it('delegates previewDepositTx to deposit service', async () => {
    depositService.previewDepositTx.mockResolvedValue({ txHash: '0x1' });

    const result = await service.previewDepositTx('user-1', BlockchainNetwork.ETH_MAINNET, '0x1');

    expect(depositService.previewDepositTx).toHaveBeenCalledWith(
      'user-1',
      BlockchainNetwork.ETH_MAINNET,
      '0x1',
    );
    expect(result).toEqual({ txHash: '0x1' });
  });

  it('delegates submitDeposit to deposit service', async () => {
    depositService.submitDeposit.mockResolvedValue({ txId: 'tx-1' });

    const result = await service.submitDeposit('user-1', {
      chain: BlockchainNetwork.ETH_MAINNET,
      txHash: '0xhash',
      amount: '1',
    });

    expect(depositService.submitDeposit).toHaveBeenCalledWith('user-1', {
      chain: BlockchainNetwork.ETH_MAINNET,
      txHash: '0xhash',
      amount: '1',
    });
    expect(result).toEqual({ txId: 'tx-1' });
  });

  it('delegates settleDepositByTxId to deposit service', async () => {
    depositService.settleDepositByTxId.mockResolvedValue({ txId: 'tx-1', settled: true });

    const result = await service.settleDepositByTxId('user-1', 'tx-1');

    expect(depositService.settleDepositByTxId).toHaveBeenCalledWith('user-1', 'tx-1');
    expect(result).toEqual({ txId: 'tx-1', settled: true });
  });

  it('delegates requestWithdrawal to withdrawal service', async () => {
    withdrawalService.requestWithdrawal.mockResolvedValue({
      txId: 'tx-w-1',
      status: OnchainTxStatus.CONFIRMING,
    });

    const result = await service.requestWithdrawal('user-1', {
      chain: BlockchainNetwork.ETH_MAINNET,
      linkedWalletId: 'link-1',
      amount: '1',
    });

    expect(withdrawalService.requestWithdrawal).toHaveBeenCalledWith('user-1', {
      chain: BlockchainNetwork.ETH_MAINNET,
      linkedWalletId: 'link-1',
      amount: '1',
    });
    expect(result).toEqual({
      txId: 'tx-w-1',
      status: OnchainTxStatus.CONFIRMING,
    });
  });

  it('delegates approveManualWithdrawal to withdrawal service', async () => {
    withdrawalService.approveManualWithdrawal.mockResolvedValue({ txId: 'tx-w-1' });

    const result = await service.approveManualWithdrawal('admin-1', 'tx-w-1');

    expect(withdrawalService.approveManualWithdrawal).toHaveBeenCalledWith('admin-1', 'tx-w-1');
    expect(result).toEqual({ txId: 'tx-w-1' });
  });

  it('delegates rejectManualWithdrawal to withdrawal service', async () => {
    withdrawalService.rejectManualWithdrawal.mockResolvedValue({
      txId: 'tx-w-1',
      status: 'FAILED',
    });

    const result = await service.rejectManualWithdrawal('admin-1', 'tx-w-1', 'risk');

    expect(withdrawalService.rejectManualWithdrawal).toHaveBeenCalledWith(
      'admin-1',
      'tx-w-1',
      'risk',
    );
    expect(result).toEqual({ txId: 'tx-w-1', status: 'FAILED' });
  });

  it('delegates processPendingManualWithdrawals to withdrawal service', async () => {
    withdrawalService.processPendingManualWithdrawals.mockResolvedValue({ processed: 2 });

    const result = await service.processPendingManualWithdrawals('admin-1', 25);

    expect(withdrawalService.processPendingManualWithdrawals).toHaveBeenCalledWith('admin-1', 25);
    expect(result).toEqual({ processed: 2 });
  });

  it('delegates getTransactions to query service', async () => {
    queryService.getTransactions.mockResolvedValue([{ txId: 'tx-1' }]);

    const result = await service.getTransactions('user-1', 30);

    expect(queryService.getTransactions).toHaveBeenCalledWith('user-1', 30);
    expect(result).toEqual([{ txId: 'tx-1' }]);
  });

  it('delegates getTransactionById to query service', async () => {
    queryService.getTransactionById.mockResolvedValue({ txId: 'tx-1' });

    const result = await service.getTransactionById('user-1', 'tx-1');

    expect(queryService.getTransactionById).toHaveBeenCalledWith('user-1', 'tx-1');
    expect(result).toEqual({ txId: 'tx-1' });
  });

  it('delegates getAdminWithdrawals to query service', async () => {
    queryService.getAdminWithdrawals.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
    const filters = { status: OnchainTxStatus.PENDING, page: 1, limit: 20 };

    const result = await service.getAdminWithdrawals(filters);

    expect(queryService.getAdminWithdrawals).toHaveBeenCalledWith(filters);
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('delegates getAdminWithdrawalById to query service', async () => {
    queryService.getAdminWithdrawalById.mockResolvedValue({ txId: 'tx-1' });

    const result = await service.getAdminWithdrawalById('tx-1');

    expect(queryService.getAdminWithdrawalById).toHaveBeenCalledWith('tx-1');
    expect(result).toEqual({ txId: 'tx-1' });
  });

  it('delegates getAdminWithdrawalStats to query service', async () => {
    queryService.getAdminWithdrawalStats.mockResolvedValue({
      pendingCount: 0,
      pendingTotalByChain: {},
    });

    const result = await service.getAdminWithdrawalStats();

    expect(queryService.getAdminWithdrawalStats).toHaveBeenCalledWith();
    expect(result).toEqual({ pendingCount: 0, pendingTotalByChain: {} });
  });
});
