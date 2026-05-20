import { Injectable, Logger } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { CircuitBreaker, CircuitBreakerState } from './circuit-breaker';
import { MetricsService } from '@/telemetry/metrics.service';
import type {
  OutboxEventPublisher,
  PublishOutboxRowInput,
  PublishOutboxRowResult,
} from './outbox-event-publisher.port';

/**
 * KafkaProducerCircuitBreakerService
 *
 * Wraps an OutboxEventPublisher (Kafka or noop) with a circuit breaker to prevent
 * cascading failures when Kafka is unavailable.
 *
 * Phase 6: Circuit breaker for Kafka producer
 *
 * Behavior:
 * - CLOSED: requests pass through to publisher, failures count up
 * - OPEN: fast-fail immediately without attempting, no retry
 * - HALF_OPEN: allow limited attempts to test recovery
 *
 * Metrics emitted:
 * - circuit_breaker_state (gauge: 0=CLOSED, 1=HALF_OPEN, 2=OPEN)
 * - circuit_breaker_tripped_total (counter when transitioning to OPEN)
 */
@Injectable()
export class KafkaProducerCircuitBreakerService implements OutboxEventPublisher {
  private readonly logger = new Logger(KafkaProducerCircuitBreakerService.name);
  private readonly tracer = trace.getTracer('be-cryptocurrency-trading-app');
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly innerPublisher: OutboxEventPublisher,
    metricsService: MetricsService,
  ) {
    this.circuitBreaker = new CircuitBreaker(
      'kafka-producer',
      {
        failureThreshold: 5,
        openDurationMs: 60_000,
        halfOpenMaxAttempts: 1,
      },
      this.logger,
      (_oldState, newState) => {
        metricsService.setCircuitBreakerState('kafka-producer', newState);
        if (newState === CircuitBreakerState.OPEN) {
          metricsService.incrementCircuitBreakerTripped('kafka-producer', 'failure_threshold');
        }
      },
    );
  }

  async publish(row: PublishOutboxRowInput): Promise<PublishOutboxRowResult | undefined> {
    return this.tracer.startActiveSpan('KafkaProducerCircuitBreaker.publish', async (span) => {
      span.setAttribute('outbox.row_id', row.id);
      span.setAttribute('outbox.event_type', row.eventType);
      span.setAttribute('outbox.aggregate_type', row.aggregateType);
      span.setAttribute('circuit_breaker.state', this.circuitBreaker.getState());

      try {
        if (!this.circuitBreaker.isAllowed()) {
          const state = this.circuitBreaker.getState();
          span.setAttribute('circuit_breaker.fast_fail', true);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Circuit breaker is ${state}, rejecting publish attempt`,
          });
          this.logger.warn(
            `Circuit breaker ${state} for kafka-producer, rejecting publish for row=${row.id} event_type=${row.eventType}`,
          );
          throw new Error(`Circuit breaker OPEN: Kafka producer unavailable`);
        }

        const result = await this.innerPublisher.publish(row);
        this.circuitBreaker.recordSuccess();
        span.setAttribute('circuit_breaker.fast_fail', false);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        this.circuitBreaker.recordFailure();
        span.setAttribute('error', true);
        span.setAttribute('error.message', (error as Error).message);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        this.logger.error(
          `Kafka publish failed row=${row.id} event_type=${row.eventType}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
