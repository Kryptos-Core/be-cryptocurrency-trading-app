import { Test } from '@nestjs/testing';
import { ADMIN_ADJUSTMENT_REPOSITORY } from '@/modules/wallets/domain/ports';
import { GetAdminAdjustmentHistoryQuery } from './get-admin-adjustment-history.query';

function makeAdjustment(
  overrides: Partial<{
    adjustmentId: string;
    actorUserId: string;
    targetUserId: string;
    currencyId: string;
    amount: string;
    type: string;
    note: string | null;
    createdAt: string;
  }> = {},
) {
  return {
    adjustmentId: 'adj-1',
    actorUserId: 'admin-uid',
    targetUserId: 'uid-1',
    currencyId: 'cid-1',
    amount: '100',
    type: 'DEPOSIT',
    note: null,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('GetAdminAdjustmentHistoryQuery', () => {
  let query: GetAdminAdjustmentHistoryQuery;

  let adjustmentRepo: jest.Mocked<{ findByTarget: jest.Mock }>;

  beforeEach(async () => {
    adjustmentRepo = { findByTarget: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetAdminAdjustmentHistoryQuery,
        { provide: ADMIN_ADJUSTMENT_REPOSITORY, useValue: adjustmentRepo },
      ],
    }).compile();

    query = module.get(GetAdminAdjustmentHistoryQuery);
  });

  it('returns adjustments for target user with default pagination', async () => {
    const adjustments = [makeAdjustment(), makeAdjustment({ adjustmentId: 'adj-2', amount: '50' })];
    adjustmentRepo.findByTarget.mockResolvedValue(adjustments);

    const result = await query.execute('uid-1');

    expect(adjustmentRepo.findByTarget).toHaveBeenCalledWith('uid-1', 50, 0);
    expect(result).toHaveLength(2);
  });

  it('passes custom limit and offset to repository', async () => {
    adjustmentRepo.findByTarget.mockResolvedValue([]);

    await query.execute('uid-1', 10, 20);

    expect(adjustmentRepo.findByTarget).toHaveBeenCalledWith('uid-1', 10, 20);
  });

  it('returns empty array when no adjustments found', async () => {
    adjustmentRepo.findByTarget.mockResolvedValue([]);

    const result = await query.execute('uid-1');

    expect(result).toEqual([]);
  });
});
