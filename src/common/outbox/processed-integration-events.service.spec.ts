import { Test } from '@nestjs/testing';
import type { EntityManager } from 'typeorm';
import { ProcessedIntegrationEventsService } from './processed-integration-events.service';

describe('ProcessedIntegrationEventsService', () => {
  it('runOnce skips callback when event already processed', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 'existing' }),
      create: jest.fn(),
      insert: jest.fn(),
    };
    const em = {
      getRepository: jest.fn().mockReturnValue(repo),
    } as unknown as EntityManager;

    const moduleRef = await Test.createTestingModule({
      providers: [ProcessedIntegrationEventsService],
    }).compile();

    const service = moduleRef.get(ProcessedIntegrationEventsService);
    const callback = jest.fn();

    const result = await service.runOnce(em, 'consumer-a', 'event-1', 'trade.executed', callback);

    expect(result).toEqual({ skipped: true });
    expect(callback).not.toHaveBeenCalled();
  });

  it('runOnce executes callback then marks processed when event is new', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input) => input),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const em = {
      getRepository: jest.fn().mockReturnValue(repo),
    } as unknown as EntityManager;

    const moduleRef = await Test.createTestingModule({
      providers: [ProcessedIntegrationEventsService],
    }).compile();

    const service = moduleRef.get(ProcessedIntegrationEventsService);
    const callback = jest.fn().mockResolvedValue('ok');

    const result = await service.runOnce(
      em,
      'consumer-b',
      'event-2',
      'wallet.balance_changed',
      callback,
    );

    expect(result).toEqual({ skipped: false, result: 'ok' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });
});
