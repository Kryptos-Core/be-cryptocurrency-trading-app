/**
 * Chaos tests: TreasuryReconciliationScheduler — scenario C3 from the plan.
 *
 * C3: Worker crash after TX_BROADCAST status set, before enqueue of confirm job.
 *     Reconciliation cron must detect stale TX_BROADCAST ops with no confirm job
 *     and re-enqueue them without double-broadcasting.
 *
 * Also covers:
 *   - No-op when confirm job already exists (idempotent reconcile)
 *   - Error resilience: DB failure logged, cron does not crash
 */

import { getQueueToken } from '@nestjs/bull';
import { Test } from '@nestjs/testing';
import { TREASURY_CONFIRM_JOB, TREASURY_QUEUE } from './constants';
import {
  TREASURY_OPERATION_REPOSITORY,
  type TreasuryOperationRepositoryPort,
} from './domain/ports';
import { TreasuryReconciliationScheduler } from './treasury-reconciliation.scheduler';

function makeStaleOp(operationId: string) {
  return { operation_id: operationId, status: 'TX_BROADCAST', wallet_id: 'w1', type: 'FUND' };
}

describe('TreasuryReconciliationScheduler — Chaos C3', () => {
  let scheduler: TreasuryReconciliationScheduler;
  let queueAdd: jest.Mock;
  let queueGetJob: jest.Mock;
  let repoFindStale: jest.Mock;

  beforeEach(async () => {
    queueAdd = jest.fn().mockResolvedValue(undefined);
    queueGetJob = jest.fn().mockResolvedValue(null);

    repoFindStale = jest.fn().mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        TreasuryReconciliationScheduler,
        {
          provide: getQueueToken(TREASURY_QUEUE),
          useValue: { add: queueAdd, getJob: queueGetJob },
        },
        {
          provide: TREASURY_OPERATION_REPOSITORY,
          useValue: {
            findStaleTxBroadcastOperations: repoFindStale,
          } as Partial<TreasuryOperationRepositoryPort>,
        },
      ],
    }).compile();

    scheduler = moduleRef.get(TreasuryReconciliationScheduler);
  });

  it('C3a: no stale operations → queue.add never called', async () => {
    repoFindStale.mockResolvedValue([]);
    await scheduler.reconcileStaleTxBroadcastOperations();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('C3b: stale op with no existing confirm job → enqueues a confirm job', async () => {
    repoFindStale.mockResolvedValue([makeStaleOp('op-001')]);
    queueGetJob.mockResolvedValue(null);

    await scheduler.reconcileStaleTxBroadcastOperations();

    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      TREASURY_CONFIRM_JOB,
      { operationId: 'op-001' },
      expect.objectContaining({
        jobId: 'treasury-confirm:op-001',
        removeOnComplete: true,
      }),
    );
  });

  it('C3c: stale op with confirm job already in queue → does NOT re-enqueue (idempotent)', async () => {
    repoFindStale.mockResolvedValue([makeStaleOp('op-002')]);
    queueGetJob.mockResolvedValue({ id: 'treasury-confirm:op-002' });

    await scheduler.reconcileStaleTxBroadcastOperations();

    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('C3d: multiple stale ops, some with confirm jobs, some without → only missing confirm jobs enqueued', async () => {
    repoFindStale.mockResolvedValue([
      makeStaleOp('op-003'),
      makeStaleOp('op-004'),
      makeStaleOp('op-005'),
    ]);

    queueGetJob.mockImplementation(async (jobId: string) => {
      if (jobId === 'treasury-confirm:op-004') return { id: jobId };
      return null;
    });

    await scheduler.reconcileStaleTxBroadcastOperations();

    expect(queueAdd).toHaveBeenCalledTimes(2);
    const calledIds = queueAdd.mock.calls.map(
      ([, data]: [string, { operationId: string }]) => data.operationId,
    );
    expect(calledIds).toContain('op-003');
    expect(calledIds).toContain('op-005');
    expect(calledIds).not.toContain('op-004');
  });

  it('C3e (resilience): DB throws → error logged, scheduler does not crash', async () => {
    repoFindStale.mockRejectedValue(new Error('DB_PRIMARY_FAILOVER'));
    await expect(scheduler.reconcileStaleTxBroadcastOperations()).resolves.toBeUndefined();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('C3f (resilience): queue.getJob throws → outer try/catch absorbs, scheduler resolves without crashing', async () => {
    repoFindStale.mockResolvedValue([makeStaleOp('op-006')]);
    queueGetJob.mockRejectedValue(new Error('REDIS_ECONNREFUSED'));

    await expect(scheduler.reconcileStaleTxBroadcastOperations()).resolves.toBeUndefined();
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
