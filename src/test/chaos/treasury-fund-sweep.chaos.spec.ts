/**
 * Chaos Test Suite — Treasury Fund/Sweep
 *
 * Scenarios from docs/PLAN_TREASURY_FUND_SWEEP_DEPOSIT.md §10.2
 * All tests run in-process with mocked dependencies; no real DB/Redis/RPC.
 *
 * Group A: Redis failures
 * Group B: RPC / TronGrid failures
 * Group C: Worker crash scenarios
 * Group D: Database failures
 */

import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RedisService } from '@/common/services';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import {
  TREASURY_CONFIRM_JOB,
  TREASURY_FUND_JOB,
  TREASURY_QUEUE,
} from '@/modules/treasury/constants';
import {
  TREASURY_ONCHAIN_READ_REPOSITORY,
  TREASURY_OPERATION_REPOSITORY,
  type TreasuryOperationRepositoryPort,
} from '@/modules/treasury/domain/ports';
import { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';
import { TreasuryProcessor } from '@/modules/treasury/treasury.processor';
import { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';
import { TreasuryOperationsService } from '@/modules/treasury/treasury-operations.service';
import { TreasuryReconciliationScheduler } from '@/modules/treasury/treasury-reconciliation.scheduler';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function buildPendingOperation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    operation_id: 'op-chaos',
    status: 'PROCESSING',
    type: 'FUND',
    chain: 'TRON_NILE',
    amount: '10',
    asset: 'NATIVE',
    to_wallet_id: 'w-dest',
    from_wallet_id: null,
    tx_hash: null,
    broadcast_idempotency_key: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildWallet(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    wallet_id: 'w-dest',
    chain: 'TRON_NILE',
    address: 'TDest123',
    is_active: true,
    ...overrides,
  };
}

type MockRepo = jest.Mocked<TreasuryOperationRepositoryPort>;

function buildMockRepo(overrides: Partial<MockRepo> = {}): MockRepo {
  return {
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
    ...overrides,
  } as MockRepo;
}

/** Build a redis client mock with all methods the service uses: set, get, del, eval */
function buildRedisClient(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    set: jest.fn().mockResolvedValue('OK'), // lock acquired by default
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    eval: jest.fn().mockResolvedValue(1),
    ...overrides,
  };
}

async function buildTestModule(
  repo: MockRepo,
  queueOverrides: Record<string, jest.Mock> = {},
  redisClientOverrides: Partial<Record<string, jest.Mock>> = {},
) {
  const redisClient = buildRedisClient(redisClientOverrides);
  const queue = {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(null),
    ...queueOverrides,
  };

  const txWalletSvc = {
    getWalletById: jest.fn().mockResolvedValue(buildWallet()),
    getMainWalletAddress: jest.fn().mockResolvedValue('TMain456'),
    getTronNativeBalanceSun: jest.fn().mockResolvedValue(0),
    getTronUsdtHumanBalanceOnChain: jest.fn().mockResolvedValue('0'),
    waitForTronUsdtBalanceReflectFund: jest.fn().mockResolvedValue(true),
    waitForTronUsdtBalanceReflectSweep: jest.fn().mockResolvedValue(true),
    waitForTronBalanceReflectSweep: jest.fn().mockResolvedValue(true),
    resolveMainWalletPrivateKey: jest.fn().mockResolvedValue('fake-private-key'),
    invalidateBalanceCache: jest.fn(),
  };

  const mainWalletSvc = {
    getMainWalletAddress: jest.fn().mockResolvedValue('TMain456'),
    sendTrxFromMain: jest.fn().mockResolvedValue('tx-chaos-ok'),
    sendUsdtFromMain: jest.fn().mockResolvedValue('tx-usdt-ok'),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      TreasuryOperationsService,
      {
        provide: RedisService,
        useValue: { getClient: () => redisClient },
      },
      { provide: TransactionWalletService, useValue: txWalletSvc },
      { provide: TreasuryMainWalletService, useValue: mainWalletSvc },
      { provide: ConfigService, useValue: { get: jest.fn() } },
      {
        provide: SystemConfigService,
        useValue: { get: jest.fn(), getEffectiveString: jest.fn() },
      },
      { provide: TREASURY_OPERATION_REPOSITORY, useValue: repo },
      { provide: TREASURY_ONCHAIN_READ_REPOSITORY, useValue: {} },
      { provide: getQueueToken(TREASURY_QUEUE), useValue: queue },
    ],
  }).compile();

  const svc = moduleRef.get(TreasuryOperationsService);
  return { svc, queue, redisClient, txWalletSvc, mainWalletSvc };
}

// ---------------------------------------------------------------------------
// Group A — Redis failures
// ---------------------------------------------------------------------------

describe('Chaos Group A — Redis failures', () => {
  describe('A1: Redis flush after enqueue but before processing', () => {
    it('enqueueFund still creates a DB operation record even when queue.getJob returns null (flush scenario)', async () => {
      const repo = buildMockRepo({
        createPendingOperation: jest
          .fn()
          .mockResolvedValue({ operation_id: 'op-a1', status: 'PENDING' }),
        findActiveDuplicateOperation: jest.fn().mockResolvedValue(null),
      });
      const { svc } = await buildTestModule(repo, {
        getJob: jest.fn().mockResolvedValue(null),
        add: jest.fn().mockResolvedValue(undefined),
      });

      const result = await svc.enqueueFund('w1', { amount: '5' }, 'actor');

      expect(repo.createPendingOperation).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ operationId: 'op-a1' });
    });
  });

  describe('A2: Redis ECONNREFUSED when acquiring wallet lock', () => {
    it('processFundJob throws when redis.set throws ECONNREFUSED, leaving operation recoverable', async () => {
      const op = buildPendingOperation({ status: 'PENDING' });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(op),
        updateByOperationId: jest.fn().mockResolvedValue(undefined),
      });

      // redis.set throws ECONNREFUSED — lock acquisition fails hard
      const { svc } = await buildTestModule(
        repo,
        {},
        {
          set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        },
      );

      await expect(svc.processFundJob({ operationId: 'op-chaos' })).rejects.toThrow('ECONNREFUSED');

      expect(repo.finalizeSuccessWithOnchainTx).not.toHaveBeenCalled();
    });
  });

  describe('A3: Redis eviction — broadcast_idempotency_key prevents double-send', () => {
    it('processFundJob skips broadcast when setBroadcastIdempotencyKey returns false (slot already claimed)', async () => {
      const op = buildPendingOperation({ status: 'PROCESSING' });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(op),
        updateByOperationId: jest.fn().mockResolvedValue(undefined),
        // Returns false = another concurrent worker already claimed the broadcast slot
        setBroadcastIdempotencyKey: jest.fn().mockResolvedValue(false),
      });

      const { svc, queue } = await buildTestModule(repo);
      const sendSpy = jest.spyOn(svc as any, 'sendFundFromMain');

      await svc.processFundJob({ operationId: 'op-chaos' });

      // Confirm job is re-enqueued so the operation still proceeds
      expect(queue.add).toHaveBeenCalledWith(
        TREASURY_CONFIRM_JOB,
        expect.any(Object),
        expect.any(Object),
      );
      // But the broadcast method is never called (no double-send)
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('A4: Lock TTL expire mid-broadcast — idempotency key prevents double-broadcast', () => {
    it('second processFundJob call for TX_BROADCAST+tx_hash operation re-enqueues confirm job without broadcasting again', async () => {
      const op = buildPendingOperation({
        status: 'TX_BROADCAST',
        tx_hash: 'tx-already-sent',
        broadcast_idempotency_key: 'key-already-set',
      });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(op),
        updateByOperationId: jest.fn().mockResolvedValue(undefined),
        setBroadcastIdempotencyKey: jest.fn(), // must NOT be called
      });

      const { svc, queue } = await buildTestModule(repo);
      const sendSpy = jest.spyOn(svc as any, 'sendFundFromMain');

      await svc.processFundJob({ operationId: 'op-chaos' });

      // Must re-enqueue confirm without touching broadcast slot
      expect(queue.add).toHaveBeenCalledWith(
        TREASURY_CONFIRM_JOB,
        expect.objectContaining({ operationId: 'op-chaos' }),
        expect.any(Object),
      );
      expect(repo.setBroadcastIdempotencyKey).not.toHaveBeenCalled();
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Group B — RPC / TronGrid failures
// ---------------------------------------------------------------------------

describe('Chaos Group B — RPC / TronGrid failures', () => {
  describe('B1: RPC returns HTTP 500', () => {
    it('processFundJob propagates error and no double-credit occurs', async () => {
      const op = buildPendingOperation({ status: 'PROCESSING' });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(op),
        updateByOperationId: jest.fn().mockResolvedValue(undefined),
        setBroadcastIdempotencyKey: jest.fn().mockResolvedValue(true),
      });

      const { svc } = await buildTestModule(repo);
      // Spy on private method to inject RPC failure without real blockchain calls
      jest
        .spyOn(svc as any, 'sendFundFromMain')
        .mockRejectedValue(new Error('RPC 500 Internal Server Error'));

      await expect(svc.processFundJob({ operationId: 'op-chaos' })).rejects.toThrow('RPC 500');

      // Error propagated — no double-credit
      expect(repo.finalizeSuccessWithOnchainTx).not.toHaveBeenCalled();
    });
  });

  describe('B2: RPC timeout — idempotency key set before broadcast prevents re-send', () => {
    it('retry with TX_BROADCAST+no-tx_hash finds slot taken and skips to confirm without re-broadcasting', async () => {
      // State after crash: key was set (status=TX_BROADCAST), but tx_hash still null
      const opAfterTimeout = buildPendingOperation({
        status: 'TX_BROADCAST',
        tx_hash: null,
        broadcast_idempotency_key: 'key-pre-rpc',
      });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(opAfterTimeout),
        updateByOperationId: jest.fn().mockResolvedValue(undefined),
        // Slot already taken — returns false
        setBroadcastIdempotencyKey: jest.fn().mockResolvedValue(false),
      });

      const { svc, queue } = await buildTestModule(repo);
      const sendSpy = jest.spyOn(svc as any, 'sendFundFromMain');

      await svc.processFundJob({ operationId: 'op-chaos' });

      // setBroadcastIdempotencyKey IS called (tries to claim new slot) but returns false
      expect(repo.setBroadcastIdempotencyKey).toHaveBeenCalledTimes(1);
      // No actual broadcast — slot was already taken
      expect(sendSpy).not.toHaveBeenCalled();
      // Confirm job enqueued to continue the operation
      expect(queue.add).toHaveBeenCalledWith(
        TREASURY_CONFIRM_JOB,
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('B3: RPC success but tx dropped — confirm job times out', () => {
    it('processTreasuryConfirmJob completes without error for COMPLETED operations (already finalized)', async () => {
      // This scenario: COMPLETED means the operation was already finalized; confirm is a no-op
      const op = buildPendingOperation({
        status: 'COMPLETED',
        tx_hash: 'tx-dropped',
      });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(op),
        finalizeSuccessWithOnchainTx: jest.fn(),
      });

      const { svc } = await buildTestModule(repo);

      // Should return without error — no double-finalize
      await expect(
        svc.processTreasuryConfirmJob({
          operationId: 'op-chaos',
          txHash: 'tx-dropped',
          amount: '10',
          mainWalletId: undefined,
          usdtPreBalance: null,
          tronPreFundSun: null,
        } as never),
      ).resolves.not.toThrow();

      expect(repo.finalizeSuccessWithOnchainTx).not.toHaveBeenCalled();
    });
  });

  describe('B4: Duplicate tx hash from RPC', () => {
    it('processFundJob propagates DB unique-constraint error without double-crediting', async () => {
      const op = buildPendingOperation({ status: 'PROCESSING' });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(op),
        setBroadcastIdempotencyKey: jest.fn().mockResolvedValue(true),
        // markProcessing succeeds; tx_hash write fails with unique constraint
        updateByOperationId: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Duplicate entry for key tx_hash')),
      });

      const { svc } = await buildTestModule(repo);
      jest.spyOn(svc as any, 'sendFundFromMain').mockResolvedValue('tx-duplicate');

      await expect(svc.processFundJob({ operationId: 'op-chaos' })).rejects.toThrow(
        'Duplicate entry',
      );
      // No double-credit: finalizeSuccess must NOT be called
      expect(repo.finalizeSuccessWithOnchainTx).not.toHaveBeenCalled();
    });
  });

  describe('B5: Intermittent RPC — eventually succeeds', () => {
    it('operation succeeds on third attempt after two transient RPC failures', async () => {
      const op = buildPendingOperation({ status: 'PROCESSING' });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(op),
        updateByOperationId: jest.fn().mockResolvedValue(undefined),
        // Models retriable job: each attempt acquires the slot fresh (operator reset between retries)
        setBroadcastIdempotencyKey: jest.fn().mockResolvedValue(true),
        finalizeSuccessWithOnchainTx: jest.fn(),
      });

      const { svc, queue } = await buildTestModule(repo);
      const sendSpy = jest
        .spyOn(svc as any, 'sendFundFromMain')
        .mockRejectedValueOnce(new Error('RPC intermittent #1'))
        .mockRejectedValueOnce(new Error('RPC intermittent #2'))
        .mockResolvedValueOnce('tx-success');

      // Attempts 1 and 2 fail
      await expect(svc.processFundJob({ operationId: 'op-chaos' })).rejects.toThrow(
        'RPC intermittent #1',
      );
      await expect(svc.processFundJob({ operationId: 'op-chaos' })).rejects.toThrow(
        'RPC intermittent #2',
      );

      // Attempt 3 succeeds
      await svc.processFundJob({ operationId: 'op-chaos' });

      expect(sendSpy).toHaveBeenCalledTimes(3);
      expect(queue.add).toHaveBeenCalledWith(
        TREASURY_CONFIRM_JOB,
        expect.any(Object),
        expect.any(Object),
      );
      // finalizeSuccess is called by the confirm job, not by processFundJob itself
      expect(repo.finalizeSuccessWithOnchainTx).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Group C — Worker crash scenarios
// ---------------------------------------------------------------------------

describe('Chaos Group C — Worker crash scenarios', () => {
  describe('C1: Crash after writing idempotency key, before broadcast', () => {
    it('retry finds slot already taken and enqueues confirm without re-broadcasting', async () => {
      // After crash: status=TX_BROADCAST (set by setBroadcastIdempotencyKey), tx_hash=null, key set
      const opAfterCrash = buildPendingOperation({
        status: 'TX_BROADCAST',
        broadcast_idempotency_key: 'key-pre-crash',
        tx_hash: null,
      });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(opAfterCrash),
        updateByOperationId: jest.fn().mockResolvedValue(undefined),
        // Slot already taken (key was set before crash) — retry cannot claim
        setBroadcastIdempotencyKey: jest.fn().mockResolvedValue(false),
      });

      const { svc, queue } = await buildTestModule(repo);
      const sendSpy = jest.spyOn(svc as any, 'sendFundFromMain');

      await svc.processFundJob({ operationId: 'op-chaos' });

      // setBroadcastIdempotencyKey IS called (tries new key) but returns false (slot taken)
      expect(repo.setBroadcastIdempotencyKey).toHaveBeenCalledTimes(1);
      // No re-broadcast
      expect(sendSpy).not.toHaveBeenCalled();
      // Confirm job enqueued to check on-chain status
      expect(queue.add).toHaveBeenCalledWith(
        TREASURY_CONFIRM_JOB,
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('C2: Crash after broadcast, before tx_hash written to DB', () => {
    it('retry finds TX_BROADCAST status and re-enqueues confirm (confirm polls on-chain for hash)', async () => {
      const opPostBroadcastNullHash = buildPendingOperation({
        status: 'TX_BROADCAST',
        broadcast_idempotency_key: 'key-set',
        tx_hash: null,
      });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(opPostBroadcastNullHash),
        updateByOperationId: jest.fn().mockResolvedValue(undefined),
        setBroadcastIdempotencyKey: jest.fn().mockResolvedValue(false), // slot already taken
      });

      const { svc, queue } = await buildTestModule(repo);
      const sendSpy = jest.spyOn(svc as any, 'sendFundFromMain');

      await svc.processFundJob({ operationId: 'op-chaos' });

      expect(queue.add).toHaveBeenCalledWith(
        TREASURY_CONFIRM_JOB,
        expect.any(Object),
        expect.any(Object),
      );
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('C3: Crash after TX_BROADCAST status set, before confirm job enqueued', () => {
    it('reconciliation scheduler re-enqueues confirm job for stale TX_BROADCAST operations', async () => {
      const staleOp = { operation_id: 'op-stale', status: 'TX_BROADCAST', tx_hash: 'tx-stale' };
      const repoMock = {
        findStaleTxBroadcastOperations: jest.fn().mockResolvedValue([staleOp]),
      };
      const queueAdd = jest.fn().mockResolvedValue(undefined);
      const queueGetJob = jest.fn().mockResolvedValue(null); // no existing confirm job

      const moduleRef = await Test.createTestingModule({
        providers: [
          TreasuryReconciliationScheduler,
          { provide: TREASURY_OPERATION_REPOSITORY, useValue: repoMock },
          {
            provide: getQueueToken(TREASURY_QUEUE),
            useValue: { add: queueAdd, getJob: queueGetJob },
          },
        ],
      }).compile();

      const scheduler = moduleRef.get(TreasuryReconciliationScheduler);
      await scheduler.reconcileStaleTxBroadcastOperations();

      expect(queueAdd).toHaveBeenCalledWith(
        TREASURY_CONFIRM_JOB,
        { operationId: 'op-stale' },
        expect.objectContaining({
          jobId: 'treasury-confirm:op-stale',
          attempts: 10,
          removeOnComplete: true,
        }),
      );
    });

    it('reconciliation scheduler skips operations that already have a confirm job in queue', async () => {
      const staleOp = { operation_id: 'op-has-confirm' };
      const repoMock = {
        findStaleTxBroadcastOperations: jest.fn().mockResolvedValue([staleOp]),
      };
      const existingJob = { id: 'treasury-confirm:op-has-confirm' };
      const queueAdd = jest.fn();
      const queueGetJob = jest.fn().mockResolvedValue(existingJob);

      const moduleRef = await Test.createTestingModule({
        providers: [
          TreasuryReconciliationScheduler,
          { provide: TREASURY_OPERATION_REPOSITORY, useValue: repoMock },
          {
            provide: getQueueToken(TREASURY_QUEUE),
            useValue: { add: queueAdd, getJob: queueGetJob },
          },
        ],
      }).compile();

      const scheduler = moduleRef.get(TreasuryReconciliationScheduler);
      await scheduler.reconcileStaleTxBroadcastOperations();

      expect(queueAdd).not.toHaveBeenCalled();
    });
  });

  describe('C4: OOM kill (SIGKILL) — Bull retries; processor rethrows WALLET_BUSY for retry', () => {
    it('processor.handleFund rethrows TreasuryWalletBusyException so Bull schedules a retry', async () => {
      const { TreasuryWalletBusyException } = await import('@/common/exceptions');
      const op = buildPendingOperation({ status: 'PENDING' });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(op),
        updateByOperationId: jest.fn().mockResolvedValue(undefined),
      });

      // Lock not acquired (another job still holds it from before the kill)
      const { svc } = await buildTestModule(
        repo,
        {},
        {
          set: jest
            .fn()
            // Lock acquisition returns null (lock NOT acquired — another job holds it)
            .mockResolvedValueOnce(null)
            // Lock wait timer set (NX) returns 'OK'
            .mockResolvedValueOnce('OK'),
          get: jest.fn().mockResolvedValue(String(Date.now() - 1000)), // timer set 1s ago (within limit)
        },
      );

      const processor = new TreasuryProcessor(svc);
      const fakeJob = { data: { operationId: 'op-chaos' } } as never;

      await expect(processor.handleFund(fakeJob)).rejects.toThrow(TreasuryWalletBusyException);

      // Processor must NOT call markFailed for WALLET_BUSY (Bull will retry)
      expect(repo.updateByOperationId).not.toHaveBeenCalledWith(
        'op-chaos',
        expect.objectContaining({ status: 'FAILED' }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Group D — Database failures
// ---------------------------------------------------------------------------

describe('Chaos Group D — Database failures', () => {
  describe('D1: DB timeout when updating status', () => {
    it('processFundJob throws on DB timeout after broadcast; idempotency key already written prevents double-broadcast on retry', async () => {
      const op = buildPendingOperation({ status: 'PROCESSING' });
      const repo = buildMockRepo({
        findByOperationId: jest.fn().mockResolvedValue(op),
        // Idempotency key write succeeds (before RPC)
        setBroadcastIdempotencyKey: jest.fn().mockResolvedValue(true),
        // markProcessing (call 1) succeeds; tx_hash write (call 2) times out
        updateByOperationId: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Query timeout after 30000ms')),
      });

      const { svc } = await buildTestModule(repo);
      // sendFundFromMain succeeds — broadcast happened
      jest.spyOn(svc as any, 'sendFundFromMain').mockResolvedValue('tx-broadcast-ok');

      await expect(svc.processFundJob({ operationId: 'op-chaos' })).rejects.toThrow(
        'Query timeout',
      );

      // Key was set before broadcast — retry will detect slot taken and skip to confirm
      expect(repo.setBroadcastIdempotencyKey).toHaveBeenCalledTimes(1);
      // No double-credit
      expect(repo.finalizeSuccessWithOnchainTx).not.toHaveBeenCalled();
    });
  });

  describe('D2: DB connection pool exhausted', () => {
    it('enqueueFund propagates pool-exhausted error without creating partial state', async () => {
      const repo = buildMockRepo({
        createPendingOperation: jest
          .fn()
          .mockRejectedValue(new Error('Connection pool exhausted: max connections reached')),
        findActiveDuplicateOperation: jest.fn().mockResolvedValue(null),
      });

      const { svc, queue } = await buildTestModule(repo);

      await expect(svc.enqueueFund('w1', { amount: '5' }, 'actor')).rejects.toThrow(
        'Connection pool exhausted',
      );

      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('D3: DB primary failover — jobs pause then resume without data loss', () => {
    it('processFundJob throws on transient DB error then succeeds after failover', async () => {
      const op = buildPendingOperation({ status: 'PROCESSING' });
      const repo = buildMockRepo({
        // findByOperationId (called by getOperationForProcessing) fails first, then succeeds
        findByOperationId: jest
          .fn()
          .mockRejectedValueOnce(new Error('ECONNRESET: DB primary failover'))
          .mockResolvedValue(op),
        updateByOperationId: jest.fn().mockResolvedValue(undefined),
        setBroadcastIdempotencyKey: jest.fn().mockResolvedValue(true),
        finalizeSuccessWithOnchainTx: jest.fn().mockResolvedValue(undefined),
      });

      const { svc, queue } = await buildTestModule(repo);
      jest.spyOn(svc as any, 'sendFundFromMain').mockResolvedValue('tx-after-failover');

      // First attempt fails due to failover
      await expect(svc.processFundJob({ operationId: 'op-chaos' })).rejects.toThrow('ECONNRESET');

      // Second attempt succeeds after failover completes
      await svc.processFundJob({ operationId: 'op-chaos' });

      expect(queue.add).toHaveBeenCalledWith(
        TREASURY_CONFIRM_JOB,
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('enqueueFund retries after DB failover without creating duplicate operations', async () => {
      const repo = buildMockRepo({
        findActiveDuplicateOperation: jest.fn().mockResolvedValue(null),
        createPendingOperation: jest
          .fn()
          .mockRejectedValueOnce(new Error('ECONNRESET: DB primary failover'))
          .mockResolvedValue({ operation_id: 'op-after-failover', status: 'PENDING' }),
      });

      const { svc } = await buildTestModule(repo, { getJob: jest.fn().mockResolvedValue(null) });

      // First call fails
      await expect(svc.enqueueFund('w1', { amount: '1' }, 'actor')).rejects.toThrow('ECONNRESET');
      // Second call succeeds
      const result = await svc.enqueueFund('w1', { amount: '1' }, 'actor');

      expect(result).toMatchObject({ operationId: 'op-after-failover' });
      // createPendingOperation called twice (once failed, once succeeded)
      expect(repo.createPendingOperation).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-group: No double-credit invariant
// ---------------------------------------------------------------------------

describe('Cross-group: No double-credit invariant', () => {
  it('finalizeSuccessWithOnchainTx is never called for COMPLETED operations (idempotent confirm)', async () => {
    const op = buildPendingOperation({ status: 'COMPLETED' });
    const repo = buildMockRepo({
      findByOperationId: jest.fn().mockResolvedValue(op),
      finalizeSuccessWithOnchainTx: jest.fn(),
    });

    const { svc } = await buildTestModule(repo);

    await svc.processTreasuryConfirmJob({
      operationId: 'op-chaos',
      txHash: 'tx-old',
      amount: '10',
      mainWalletId: undefined,
      usdtPreBalance: null,
      tronPreFundSun: null,
    } as never);

    expect(repo.finalizeSuccessWithOnchainTx).not.toHaveBeenCalled();
  });

  it('finalizeSuccessWithOnchainTx is never called for FAILED operations (no re-credit after failure)', async () => {
    const op = buildPendingOperation({ status: 'FAILED' });
    const repo = buildMockRepo({
      findByOperationId: jest.fn().mockResolvedValue(op),
      finalizeSuccessWithOnchainTx: jest.fn(),
    });

    const { svc } = await buildTestModule(repo);

    await svc.processTreasuryConfirmJob({
      operationId: 'op-chaos',
      txHash: 'tx-failed',
      amount: '10',
      mainWalletId: undefined,
      usdtPreBalance: null,
      tronPreFundSun: null,
    } as never);

    expect(repo.finalizeSuccessWithOnchainTx).not.toHaveBeenCalled();
  });
});
