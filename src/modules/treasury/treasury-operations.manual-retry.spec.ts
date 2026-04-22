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

describe('TreasuryOperationsService manualRetry', () => {
  let svc: TreasuryOperationsService;
  let repo: jest.Mocked<
    Pick<
      TreasuryOperationRepositoryPort,
      'findByOperationIdWithWallets' | 'findByOperationId' | 'updateByOperationId'
    >
  >;
  let redisDel: jest.Mock;
  let queueAdd: jest.Mock;

  beforeEach(async () => {
    redisDel = jest.fn().mockResolvedValue(1);
    queueAdd = jest.fn().mockResolvedValue(undefined);

    repo = {
      findByOperationIdWithWallets: jest.fn(),
      findByOperationId: jest.fn(),
      updateByOperationId: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TreasuryOperationsService,
        {
          provide: RedisService,
          useValue: {
            getClient: () => ({
              set: jest.fn().mockResolvedValue('OK'),
              get: jest.fn().mockResolvedValue(null),
              del: redisDel,
              eval: jest.fn(),
            }),
          },
        },
        {
          provide: TransactionWalletService,
          useValue: { getWalletById: jest.fn(), getMainWalletAddress: jest.fn() },
        },
        { provide: TreasuryMainWalletService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: SystemConfigService,
          useValue: { get: jest.fn(), getEffectiveString: jest.fn() },
        },
        { provide: TREASURY_OPERATION_REPOSITORY, useValue: repo },
        { provide: TREASURY_ONCHAIN_READ_REPOSITORY, useValue: {} },
        {
          provide: getQueueToken(TREASURY_QUEUE),
          useValue: { add: queueAdd, getJob: jest.fn() },
        },
      ],
    }).compile();

    svc = moduleRef.get(TreasuryOperationsService);
  });

  it('clears the lockWaitTimer Redis key before re-enqueueing a FUND operation', async () => {
    const operationId = 'op-fund-1';
    repo.findByOperationIdWithWallets.mockResolvedValue({
      operation_id: operationId,
      type: 'FUND',
      status: 'PROCESSING',
      to_wallet_id: 'w1',
      from_wallet_id: null,
      chain: 'TRON_NILE',
    } as never);

    await svc.manualRetryTreasuryOperation(operationId, undefined, 'actor-admin');

    // forceReleaseTreasuryWalletLock deletes lock + lockWaitTimer
    expect(redisDel).toHaveBeenCalledWith('treasury:lock:w1');
    expect(redisDel).toHaveBeenCalledWith(`treasury:lock-wait-since:${operationId}`);
  });

  it('clears the lockWaitTimer Redis key before re-enqueueing a SWEEP operation', async () => {
    const operationId = 'op-sweep-1';
    repo.findByOperationIdWithWallets.mockResolvedValue({
      operation_id: operationId,
      type: 'SWEEP',
      status: 'PROCESSING',
      from_wallet_id: 'w2',
      to_wallet_id: null,
      chain: 'TRON_NILE',
    } as never);

    await svc.manualRetryTreasuryOperation(operationId, undefined, 'actor-admin');

    expect(redisDel).toHaveBeenCalledWith('treasury:lock:w2');
    expect(redisDel).toHaveBeenCalledWith(`treasury:lock-wait-since:${operationId}`);
  });

  it('enqueues manual-retry job with attempts=10 and timeout=60_000', async () => {
    const operationId = 'op-fund-2';
    repo.findByOperationIdWithWallets.mockResolvedValue({
      operation_id: operationId,
      type: 'FUND',
      status: 'PENDING',
      to_wallet_id: 'w1',
      from_wallet_id: null,
      chain: 'TRON_NILE',
    } as never);

    await svc.manualRetryTreasuryOperation(operationId, undefined, 'actor-admin');

    expect(queueAdd).toHaveBeenCalledWith(
      TREASURY_FUND_JOB,
      { operationId },
      expect.objectContaining({
        attempts: 10,
        timeout: 60_000,
        backoff: { type: 'treasuryDefer', delay: 5_000 },
      }),
    );
  });
});
