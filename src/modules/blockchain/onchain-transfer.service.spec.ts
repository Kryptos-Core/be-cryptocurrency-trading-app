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
  };
  const queryService = {};

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
});
