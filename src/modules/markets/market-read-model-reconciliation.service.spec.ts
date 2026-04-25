import { MarketReadModelReconciliationService } from './market-read-model-reconciliation.service';

describe('MarketReadModelReconciliationService', () => {
  it('compares core trades with read model trades', async () => {
    const service = new MarketReadModelReconciliationService({
      query: jest.fn().mockResolvedValue([{ trade_id: 'trade-1' }, { trade_id: 'trade-2' }]),
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([{ trade_id: 'trade-1' }]),
        })),
      })),
    } as never);

    const report = await service.reconcileTrades(24);

    expect(report).toEqual({
      coreCount: 2,
      readModelCount: 1,
      missingTrades: ['trade-2'],
      drift: 1,
      windowHours: 24,
    });
  });
});
