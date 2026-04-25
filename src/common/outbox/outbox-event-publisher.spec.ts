import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Producer } from 'kafkajs';
import {
  KafkaOutboxEventPublisher,
  KafkaOutboxEventPublisherDriver,
} from './kafka-outbox-event-publisher.service';
import {
  NoopOutboxEventPublisher,
  NoopOutboxEventPublisherDriver,
} from './noop-outbox-event-publisher.service';

describe('Outbox publisher drivers', () => {
  it('noop driver resolves noop publisher', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [NoopOutboxEventPublisher, NoopOutboxEventPublisherDriver],
    }).compile();

    const driver = moduleRef.get(NoopOutboxEventPublisherDriver);
    expect(driver.supports('noop')).toBe(true);

    const publisher = driver.create();
    const result = await publisher.publish({
      id: 'event-1',
      eventType: 'trade.executed',
      aggregateType: 'trade',
      aggregateId: 'trade-1',
      payload: { tradeId: 'trade-1' },
      schemaVersion: 1,
      kafkaTopic: null,
    });

    expect(result?.kafkaPartition).toBeNull();
    expect(result?.kafkaOffset).toBeNull();
    expect(result?.publishedAt).toBeInstanceOf(Date);
  });

  it('kafka driver resolves kafka publisher and publishes with derived topic', async () => {
    const send = jest.fn().mockResolvedValue([{ partition: 3, baseOffset: '99' }]);
    const connect = jest.fn().mockResolvedValue(undefined);
    const producer = { connect, send } as unknown as Producer;

    const moduleRef = await Test.createTestingModule({
      providers: [
        KafkaOutboxEventPublisher,
        KafkaOutboxEventPublisherDriver,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'KAFKA_BROKERS':
                  return '127.0.0.1:9092';
                case 'KAFKA_CLIENT_ID':
                  return 'test-client';
                case 'KAFKA_TOPIC_PREFIX':
                  return 'trading';
                default:
                  return undefined;
              }
            }),
          },
        },
      ],
    }).compile();

    const publisher = moduleRef.get(KafkaOutboxEventPublisher);
    (publisher as unknown as { connectProducer: () => Promise<Producer> }).connectProducer = jest
      .fn()
      .mockResolvedValue(producer);

    const driver = moduleRef.get(KafkaOutboxEventPublisherDriver);
    expect(driver.supports('kafka')).toBe(true);

    const result = await driver.create().publish({
      id: 'event-2',
      eventType: 'trade.executed',
      aggregateType: 'trade',
      aggregateId: 'trade-2',
      payload: { tradeId: 'trade-2' },
      schemaVersion: 1,
      correlationId: 'corr-2',
      partitionKey: 'BTC-USDT',
      kafkaTopic: null,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].topic).toBe('trading.trade.executed');
    expect(send.mock.calls[0][0].messages[0].key).toBe('BTC-USDT');
    expect(result).toEqual({
      kafkaPartition: 3,
      kafkaOffset: '99',
      publishedAt: expect.any(Date),
    });
  });
});
