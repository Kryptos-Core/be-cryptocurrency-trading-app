import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RedisService } from '@/common/services';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { TREASURY_FUND_JOB, TREASURY_QUEUE } from './constants';
import {
  TREASURY_ONCHAIN_READ_REPOSITORY,
  TREASURY_OPERATION_REPOSITORY,
  type TreasuryOperationRepositoryPort,
} from './domain/ports';
import { TransactionWalletService } from './transaction-wallet.service';
import { TreasuryMainWalletService } from './treasury-main-wallet.service';
import { TreasuryOperationsService } from './treasury-operations.service';

describe('TreasuryOperationsService enqueue idempotency', () => {
  let svc: TreasuryOperationsService;
  let repo: jest.Mocked<TreasuryOperationRepositoryPort>;
  let queueAdd: jest.Mock;
  let getJob: jest.Mock;

  beforeEach(async () => {
    repo = {
      createPendingOperation: jest.fn(),
      findByOperationIdWithWallets: jest.fn(),
      findByOperationId: jest.fn(),
      findActiveDuplicateOperation: jest.fn(),
      countNonTerminalForWallet: jest.fn(),
      updateByOperationId: jest.fn(),
      listWithFilters: jest.fn(),
      finalizeSuccessWithOnchainTx: jest.fn(),
      findOnchainTreasuryLeg: jest.fn(),
    };

    queueAdd = jest.fn().mockResolvedValue(undefined);
    getJob = jest.fn().mockResolvedValue(null);

    const mockQueue = {
      add: queueAdd,
      getJob,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TreasuryOperationsService,
        {
          provide: RedisService,
          useValue: {
            getClient: () => ({ set: jest.fn().mockResolvedValue('OK'), eval: jest.fn() }),
          },
        },
        {
          provide: TransactionWalletService,
          useValue: {
            getWalletById: jest.fn().mockResolvedValue({
              wallet_id: 'w1',
              chain: 'TRON_NILE',
              is_active: true,
            }),
          },
        },
        { provide: TreasuryMainWalletService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: SystemConfigService,
          useValue: { get: jest.fn(), getEffectiveString: jest.fn() },
        },
        { provide: TREASURY_OPERATION_REPOSITORY, useValue: repo },
        { provide: TREASURY_ONCHAIN_READ_REPOSITORY, useValue: {} },
        { provide: getQueueToken(TREASURY_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    svc = moduleRef.get(TreasuryOperationsService);
  });

  it('enqueues a new fund job on every call (no same-amount dedupe)', async () => {
    repo.createPendingOperation
      .mockResolvedValueOnce({ operation_id: 'op-1', status: 'PENDING' } as never)
      .mockResolvedValueOnce({ operation_id: 'op-2', status: 'PENDING' } as never);

    const a = await svc.enqueueFund('w1', { amount: '1' }, 'actor-1');
    const b = await svc.enqueueFund('w1', { amount: '1' }, 'actor-1');

    expect(a.operationId).toBe('op-1');
    expect(b.operationId).toBe('op-2');
    expect(repo.createPendingOperation).toHaveBeenCalledTimes(2);
    expect(queueAdd).toHaveBeenCalledTimes(2);
  });

  it('enqueues with unique jobId and treasuryDefer backoff', async () => {
    repo.createPendingOperation.mockResolvedValue({
      operation_id: 'new-op',
      status: 'PENDING',
    } as never);

    await svc.enqueueFund('w1', { amount: '1' }, 'actor-1');

    expect(queueAdd).toHaveBeenCalledWith(
      TREASURY_FUND_JOB,
      { operationId: 'new-op' },
      expect.objectContaining({
        jobId: expect.stringMatching(/^treasury-fund:w1:NATIVE:/),
        backoff: { type: 'treasuryDefer', delay: 3000 },
      }),
    );
  });
});
