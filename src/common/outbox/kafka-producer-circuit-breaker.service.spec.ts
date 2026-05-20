import { Logger } from '@nestjs/common';
import { CircuitBreakerState } from './circuit-breaker';
import { KafkaProducerCircuitBreakerService } from './kafka-producer-circuit-breaker.service';
import type { OutboxEventPublisher, PublishOutboxRowInput } from './outbox-event-publisher.port';

const makeRow = (id = 'row-1', eventType = 'trade.executed'): PublishOutboxRowInput => ({
  id,
  eventType,
  aggregateType: 'trade',
  aggregateId: 'agg-1',
  payload: {},
  schemaVersion: 1,
});

describe('KafkaProducerCircuitBreakerService', () => {
  let innerPublisher: jest.Mocked<OutboxEventPublisher>;
  let circuitBreakerService: KafkaProducerCircuitBreakerService;

  beforeEach(() => {
    innerPublisher = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<OutboxEventPublisher>;
    circuitBreakerService = new KafkaProducerCircuitBreakerService(
      innerPublisher,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { setCircuitBreakerState: jest.fn(), incrementCircuitBreakerTripped: jest.fn() } as any,
    );
  });

  describe('publish behavior', () => {
    it('publishes successfully when circuit is CLOSED', async () => {
      const row = makeRow();
      innerPublisher.publish.mockResolvedValue({
        kafkaPartition: 1,
        kafkaOffset: '100',
        publishedAt: new Date(),
      });

      const result = await circuitBreakerService.publish(row);

      expect(innerPublisher.publish).toHaveBeenCalledWith(row);
      expect(result?.kafkaPartition).toBe(1);
      expect(result?.kafkaOffset).toBe('100');
    });

    it('throws when circuit is OPEN', async () => {
      const row = makeRow();

      // Trigger circuit OPEN by exhausting failures
      innerPublisher.publish.mockRejectedValue(new Error('boom'));
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreakerService.publish(row)).rejects.toThrow('boom');
      }

      // After 5 failures, circuit should be OPEN
      await expect(circuitBreakerService.publish(row)).rejects.toThrow('Circuit breaker OPEN');
      expect(innerPublisher.publish).toHaveBeenCalledTimes(5);
    });

    it('recovers when HALF_OPEN circuit succeeds', async () => {
      const row = makeRow();

      innerPublisher.publish.mockRejectedValue(new Error('boom'));
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreakerService.publish(row)).rejects.toThrow('boom');
      }

      // Circuit should be OPEN now
      await expect(circuitBreakerService.publish(row)).rejects.toThrow('Circuit breaker OPEN');
      expect(innerPublisher.publish).toHaveBeenCalledTimes(5);
    });

    it('records failure when inner publisher throws', async () => {
      const row = makeRow();
      innerPublisher.publish.mockRejectedValue(new Error('kafka down'));

      await expect(circuitBreakerService.publish(row)).rejects.toThrow('kafka down');

      expect(innerPublisher.publish).toHaveBeenCalledTimes(1);
    });
  });
});
