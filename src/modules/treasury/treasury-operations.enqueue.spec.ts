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

  function buildModule(getJobImpl: () => jest.Mock) {
    getJob = getJobImpl();
    queueAdd = jest.fn().mockResolvedValue(undefined);
    const mockQueue = { add: queueAdd, getJob };

    return Test.createTestingModule({
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
  }

  beforeEach(() => {
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
      setBroadcastIdempotencyKey: jest.fn(),
      findStaleTxBroadcastOperations: jest.fn(),
    };
  });

  describe('deterministic jobId — no uuidv7 suffix', () => {
    beforeEach(async () => {
      const moduleRef = await buildModule(() => jest.fn().mockResolvedValue(null));
      svc = moduleRef.get(TreasuryOperationsService);
      repo.createPendingOperation.mockResolvedValue({
        operation_id: 'new-op',
        status: 'PENDING',
      } as never);
    });

    it('uses deterministic jobId treasury-fund:{walletId}:{asset}:{amount} (no UUID suffix)', async () => {
      await svc.enqueueFund('w1', { amount: '1' }, 'actor-1');

      expect(queueAdd).toHaveBeenCalledWith(
        TREASURY_FUND_JOB,
        { operationId: 'new-op' },
        expect.objectContaining({
          jobId: 'treasury-fund:w1:NATIVE:1',
        }),
      );
    });

    it('uses attempts=10, timeout=60_000 and delay=5_000 on fund job', async () => {
      await svc.enqueueFund('w1', { amount: '1' }, 'actor-1');

      expect(queueAdd).toHaveBeenCalledWith(
        TREASURY_FUND_JOB,
        expect.anything(),
        expect.objectContaining({
          attempts: 10,
          timeout: 60_000,
          backoff: { type: 'treasuryDefer', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: true,
        }),
      );
    });
  });

  describe('deduplication — second enqueue for same wallet returns alreadyQueued', () => {
    it('returns alreadyQueued:true when FUND job for same wallet is already waiting', async () => {
      // First call: no existing job
      const getJobOnce = jest.fn().mockResolvedValueOnce(null);
      const mockQueue = { add: jest.fn().mockResolvedValue(undefined), getJob: getJobOnce };
      repo.createPendingOperation.mockResolvedValue({
        operation_id: 'op-1',
        status: 'PENDING',
      } as never);

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

      // Second call: getJob returns a waiting job with the original operation ID
      getJobOnce.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('waiting'),
        data: { operationId: 'op-1' },
        remove: jest.fn(),
      });
      repo.findByOperationId.mockResolvedValue({
        operation_id: 'op-1',
        status: 'PENDING',
      } as never);

      const result = await svc.enqueueFund('w1', { amount: '1' }, 'actor-1');

      expect(result).toEqual({ operationId: 'op-1', status: 'PENDING', alreadyQueued: true });
      expect(mockQueue.add).not.toHaveBeenCalledTimes(2);
    });

    it('removes completed job and creates fresh FUND operation when stale completed job exists', async () => {
      const staleJob = {
        getState: jest.fn().mockResolvedValue('completed'),
        data: { operationId: 'old-op' },
        remove: jest.fn().mockResolvedValue(undefined),
      };
      const getJobMock = jest.fn().mockResolvedValue(staleJob);
      const addMock = jest.fn().mockResolvedValue(undefined);
      const mockQueue = { add: addMock, getJob: getJobMock };

      repo.createPendingOperation.mockResolvedValue({
        operation_id: 'new-op',
        status: 'PENDING',
      } as never);

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

      const result = await svc.enqueueFund('w1', { amount: '1' }, 'actor-1');

      expect(staleJob.remove).toHaveBeenCalled();
      expect(repo.createPendingOperation).toHaveBeenCalledTimes(1);
      expect(addMock).toHaveBeenCalledTimes(1);
      expect(result.operationId).toBe('new-op');
      expect(result.alreadyQueued).toBeFalsy();
    });
  });
});
