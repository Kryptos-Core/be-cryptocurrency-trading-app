import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { RedisService } from '@/common/services';
import { UnitOfWork } from '@/common/unit-of-work/unit-of-work';
import { TradingPriceStreamService } from './trading-price-stream.service';

describe('TradingPriceStreamService', () => {
  it('appends market.ticker_updated outbox event after successful price publish', async () => {
    const publish = jest.fn().mockResolvedValue(1);
    const redisService = {
      getPublisher: () => ({ publish }),
      getSubscriber: () => ({ subscribe: jest.fn(), on: jest.fn() }),
    };
    const unitOfWork = {
      run: jest.fn(async (work) => work({})),
    };
    const outboxAppender = {
      append: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TradingPriceStreamService,
        { provide: RedisService, useValue: redisService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: UnitOfWork, useValue: unitOfWork },
        { provide: OutboxAppender, useValue: outboxAppender },
      ],
    }).compile();

    const service = moduleRef.get(TradingPriceStreamService);

    await service.publishPriceUpdate({
      pair_id: 'pair-1',
      symbol: 'BTC/USDT',
      last_price: '65000',
      bid: '64999',
      ask: '65001',
      volume_24h: '100',
      volume_24h_usd: '6500000',
      change_24h: '1000',
      change_percent_24h: '1.56',
      high_24h: '66000',
      low_24h: '64000',
      open_24h: '64000',
      timestamp: '2026-04-25T00:00:00.000Z',
    });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
    expect(outboxAppender.append).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        aggregateType: 'marketTicker',
        aggregateId: 'pair-1',
        eventType: 'market.ticker_updated',
        kafkaTopic: 'market.ticker',
        partitionKey: 'pair-1',
      }),
    );
  });

  it('does not append outbox event when publish fails after retries', async () => {
    const publish = jest.fn().mockRejectedValue(new Error('redis down'));
    const redisService = {
      getPublisher: () => ({ publish }),
      getSubscriber: () => ({ subscribe: jest.fn(), on: jest.fn() }),
    };
    const unitOfWork = {
      run: jest.fn(async (work) => work({})),
    };
    const outboxAppender = {
      append: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TradingPriceStreamService,
        { provide: RedisService, useValue: redisService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: UnitOfWork, useValue: unitOfWork },
        { provide: OutboxAppender, useValue: outboxAppender },
      ],
    }).compile();

    const service = moduleRef.get(TradingPriceStreamService);

    await service.publishPriceUpdate({
      pair_id: 'pair-1',
      symbol: 'BTC/USDT',
      last_price: '65000',
      bid: '64999',
      ask: '65001',
      volume_24h: '100',
      volume_24h_usd: '6500000',
      change_24h: '1000',
      change_percent_24h: '1.56',
      high_24h: '66000',
      low_24h: '64000',
      open_24h: '64000',
      timestamp: '2026-04-25T00:00:00.000Z',
    });

    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(outboxAppender.append).not.toHaveBeenCalled();
  });
});
