import { Test } from '@nestjs/testing';
import type { Job } from 'bull';
import { BusinessException, TreasuryWalletBusyException } from '@/common/exceptions';
import { TREASURY_FUND_JOB } from './constants';
import { TreasuryProcessor } from './treasury.processor';
import { TreasuryOperationsService } from './treasury-operations.service';

function makeJob(data: { operationId: string }): Job<{ operationId: string }> {
  return { data: data, id: 'job-1', name: TREASURY_FUND_JOB } as unknown as Job<{
    operationId: string;
  }>;
}

describe('TreasuryProcessor', () => {
  let processor: TreasuryProcessor;
  let svc: jest.Mocked<TreasuryOperationsService>;

  beforeEach(async () => {
    svc = {
      processFundJob: jest.fn(),
      processSweepJob: jest.fn(),
      markFailed: jest.fn(),
    } as unknown as jest.Mocked<TreasuryOperationsService>;

    const moduleRef = await Test.createTestingModule({
      providers: [TreasuryProcessor, { provide: TreasuryOperationsService, useValue: svc }],
    }).compile();

    processor = moduleRef.get(TreasuryProcessor);
  });

  it('rethrows TreasuryWalletBusyException without markFailed (Bull backoff handles defer)', async () => {
    const busy = new TreasuryWalletBusyException();
    svc.processFundJob.mockRejectedValue(busy);

    await expect(processor.handleFund(makeJob({ operationId: 'op-1' }))).rejects.toBe(busy);
    expect(svc.markFailed).not.toHaveBeenCalled();
  });

  it('marks failed on real errors', async () => {
    const err = new Error('rpc down');
    svc.processFundJob.mockRejectedValue(err);

    await expect(processor.handleFund(makeJob({ operationId: 'op-2' }))).rejects.toBe(err);
    expect(svc.markFailed).toHaveBeenCalledWith('op-2', 'rpc down');
  });

  it('marks failed for busy-timeout then rethrows', async () => {
    const err = new BusinessException('timeout', 'TREASURY_WALLET_BUSY_TIMEOUT');
    svc.processFundJob.mockRejectedValue(err);

    await expect(processor.handleFund(makeJob({ operationId: 'op-3' }))).rejects.toBe(err);
    expect(svc.markFailed).toHaveBeenCalledWith('op-3', 'timeout');
  });

  it('skips markFailed for duplicate terminal status', async () => {
    const err = new BusinessException('bad status', 'TREASURY_OPERATION_INVALID_STATUS');
    svc.processFundJob.mockRejectedValue(err);

    await processor.handleFund(makeJob({ operationId: 'op-4' }));
    expect(svc.markFailed).not.toHaveBeenCalled();
  });
});
