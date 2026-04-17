import { Test } from '@nestjs/testing';
import type { EntityManager } from 'typeorm';
import { OutboxAppender } from './outbox-appender.service';

describe('OutboxAppender', () => {
  it('persists a row via EntityManager.save', async () => {
    const saved: unknown[] = [];
    const manager = {
      create: (_cls: unknown, row: unknown) => row,
      save: async (_cls: unknown, row: unknown) => {
        saved.push(row);
      },
    } as unknown as EntityManager;

    const moduleRef = await Test.createTestingModule({
      providers: [OutboxAppender],
    }).compile();

    const appender = moduleRef.get(OutboxAppender);
    await appender.append(manager, {
      aggregateType: 'MarketPair',
      aggregateId: 'p1',
      eventType: 'MarketPair.Created@v1',
      payload: {
        pairId: 'p1',
        symbol: 'BTC/USDT',
        baseCurrencyId: 'b',
        quoteCurrencyId: 'q',
        isActive: true,
      },
      dedupeKey: 'k1',
    });

    expect(saved).toHaveLength(1);
    expect((saved[0] as { event_type: string }).event_type).toBe('MarketPair.Created@v1');
  });
});
