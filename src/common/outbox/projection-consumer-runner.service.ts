import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { MetricsService } from '@/telemetry/metrics.service';
import { MarketOhlcvReadModelSyncApplierService } from '@/common/read-model/market-ohlcv-read-model-sync-applier.service';
import { MarketPairReadModelSyncApplierService } from '@/common/read-model/market-pair-read-model-sync-applier.service';
import { MarketTickerReadModelSyncApplierService } from '@/common/read-model/market-ticker-read-model-sync-applier.service';
import { OnchainDepositReadModelSyncApplierService } from '@/common/read-model/onchain-deposit-read-model-sync-applier.service';
import { TradeReadModelSyncApplierService } from '@/common/read-model/trade-read-model-sync-applier.service';
import { OnchainDepositOutboxNotificationService } from '@/modules/notifications/onchain-deposit-outbox-notification.service';
import {
  isCanonicalIntegrationEventEnvelope,
  unwrapCanonicalIntegrationEventPayload,
} from '@/common/integration-events/canonical-integration-event-envelope';
import {
  OutboxIntegrationEventType,
  type OutboxIntegrationEventTypeName,
} from '@/common/integration-events/integration-event-catalog';
import type { MarketPairReadModelSyncPayload } from '@/common/integration-events/market-pair-read-model-sync.integration-event';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { ProcessedIntegrationEventsService } from '@/common/outbox/processed-integration-events.service';
import { DataSource } from 'typeorm';
import {
  CircuitBreakerRegistry,
  CircuitBreakerState,
} from './circuit-breaker';

/**
 * ProjectionConsumerRunnerService
 *
 * ADR-001: Relay vs Projection Decoupling (2026-05-08)
 *
 * Phase 5b: Circuit Breaker per Projection Consumer
 *
 * Runs read-model projections asynchronously, reading from processed_integration_events.
 * Each projection consumer runs independently with its own circuit breaker.
 *
 * Circuit Breaker:
 * - Failure threshold: 3 consecutive failures → OPEN
 * - Open duration: 30s → HALF_OPEN
 * - HALF_OPEN: 1 event to test recovery
 * - Event skipped due to circuit OPEN → immediate alert
 */
export const PROJECTION_CONSUMERS = {
  marketPairReadModel: 'market-pair-read-model-sync',
  onchainDepositReadModel: 'onchain-deposit-read-model-sync',
  onchainDepositNotification: 'onchain-deposit-notification-sync',
  tradeReadModel: 'trade-read-model-sync',
  marketTickerReadModel: 'market-ticker-read-model-sync',
  marketOhlcvReadModel: 'market-ohlcv-read-model-sync',
} as const;

export type ProjectionConsumerName = (typeof PROJECTION_CONSUMERS)[keyof typeof PROJECTION_CONSUMERS];

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 1000;

@Injectable()
export class ProjectionConsumerRunnerService implements OnModuleInit {
  private readonly logger = new Logger(ProjectionConsumerRunnerService.name);
  private isRunning = false;
  private readonly circuitBreakerRegistry: CircuitBreakerRegistry;

  constructor(
    private readonly dataSource: DataSource,
    private readonly processedEventsService: ProcessedIntegrationEventsService,
    private readonly marketPairApplier: MarketPairReadModelSyncApplierService,
    private readonly onchainDepositReadApplier: OnchainDepositReadModelSyncApplierService,
    private readonly tradeReadModelApplier: TradeReadModelSyncApplierService,
    private readonly marketTickerReadModelApplier: MarketTickerReadModelSyncApplierService,
    private readonly marketOhlcvReadModelApplier: MarketOhlcvReadModelSyncApplierService,
    private readonly onchainDepositNotifications: OnchainDepositOutboxNotificationService,
    private readonly metricsService: MetricsService,
  ) {
    this.circuitBreakerRegistry = new CircuitBreakerRegistry(this.logger);
    this.initializeCircuitBreakers();
  }

  private initializeCircuitBreakers(): void {
    // Initialize circuit breakers for all consumers
    for (const consumerName of Object.values(PROJECTION_CONSUMERS)) {
      const cb = this.circuitBreakerRegistry.getOrCreate(consumerName);
      this.metricsService.setProjectionConsumerState(consumerName, CircuitBreakerState.CLOSED);
    }
  }

  onModuleInit(): void {
    this.start();
  }

  /**
   * Start the projection consumer runner loop.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('ProjectionConsumerRunnerService already running');
      return;
    }
    this.isRunning = true;
    this.logger.log('Starting ProjectionConsumerRunnerService');
    this.runLoop();
  }

  /**
   * Stop the projection consumer runner loop.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.log('Stopping ProjectionConsumerRunnerService');
  }

  /**
   * Get circuit breaker metrics for all consumers
   */
  getCircuitBreakerMetrics() {
    return this.circuitBreakerRegistry.getAllMetrics();
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.processNextBatch();
      } catch (error) {
        this.logger.error(
          `Projection consumer loop error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
      await this.sleep(POLL_INTERVAL_MS);
    }
  }

  private async processNextBatch(): Promise<void> {
    const tracer = trace.getTracer('be-cryptocurrency-trading-app');

    await tracer.startActiveSpan('ProjectionConsumerRunner.processBatch', async (span) => {
      try {
        const rows = await this.fetchUnprocessedEvents();
        if (rows.length === 0) {
          span.setAttribute('projection.events_processed', 0);
          return;
        }

        for (const row of rows) {
          await this.processEvent(row);
        }

        span.setAttribute('projection.events_processed', rows.length);
        this.metricsService.incrementProjectionConsumerProcessed(rows.length);
      } finally {
        span.end();
      }
    });
  }

  private async fetchUnprocessedEvents(): Promise<IntegrationOutbox[]> {
    return this.dataSource.transaction(async (em) => {
      const rows = await em
        .createQueryBuilder(IntegrationOutbox, 'o')
        .where('o.published_at IS NOT NULL')
        .andWhere('o.dead_lettered_at IS NULL')
        .orderBy('o.occurred_at', 'ASC')
        .take(BATCH_SIZE)
        .getMany();

      return rows;
    });
  }

  private async processEvent(row: IntegrationOutbox): Promise<void> {
    const eventType = row.event_type as OutboxIntegrationEventTypeName;

    switch (eventType) {
      case OutboxIntegrationEventType.MarketPairCreatedV1:
      case OutboxIntegrationEventType.MarketPairUpdatedV1:
        await this.runProjection(
          PROJECTION_CONSUMERS.marketPairReadModel,
          row,
          async (em) => {
            const payload = this.getPayload<MarketPairReadModelSyncPayload>(row);
            await this.marketPairApplier.apply(em, payload);
          },
        );
        return;

      case OutboxIntegrationEventType.OnchainDepositSubmittedV1:
      case OutboxIntegrationEventType.OnchainDepositSettledV1:
      case OutboxIntegrationEventType.DepositMatchedV1:
        await this.runProjection(
          PROJECTION_CONSUMERS.onchainDepositReadModel,
          row,
          async (em) => {
            await this.onchainDepositReadApplier.applyFromOutboxRow(em, row);
          },
        );
        await this.runProjection(
          PROJECTION_CONSUMERS.onchainDepositNotification,
          row,
          async (em) => {
            await this.onchainDepositNotifications.applyFromOutboxRow(em, row);
          },
        );
        return;

      case OutboxIntegrationEventType.TradeExecutedV1:
        await this.runProjection(
          PROJECTION_CONSUMERS.tradeReadModel,
          row,
          async (em) => {
            await this.tradeReadModelApplier.applyFromOutboxRow(em, row);
          },
        );
        await this.runProjection(
          PROJECTION_CONSUMERS.marketOhlcvReadModel,
          row,
          async (em) => {
            await this.marketOhlcvReadModelApplier.applyFromOutboxRow(em, row);
          },
        );
        return;

      case OutboxIntegrationEventType.MarketTickerUpdatedV1:
        await this.runProjection(
          PROJECTION_CONSUMERS.marketTickerReadModel,
          row,
          async (em) => {
            await this.marketTickerReadModelApplier.applyFromOutboxRow(em, row);
          },
        );
        return;

      case OutboxIntegrationEventType.OrderCreatedV1:
      case OutboxIntegrationEventType.OrderCancelRequestedV1:
      case OutboxIntegrationEventType.OrderCancelledV1:
      case OutboxIntegrationEventType.OrderRejectedV1:
      case OutboxIntegrationEventType.WalletBalanceChangedV1:
        // These events are not projected to read models
        await this.markProcessedWithoutProjection(row);
        return;

      default:
        this.logger.warn(`Unsupported event_type=${eventType} id=${row.id}`);
        return;
    }
  }

  private async runProjection(
    consumerName: ProjectionConsumerName,
    row: IntegrationOutbox,
    projectionFn: (em: import('typeorm').EntityManager) => Promise<void>,
  ): Promise<void> {
    const circuitBreaker = this.circuitBreakerRegistry.get(consumerName);

    // Check circuit breaker
    if (circuitBreaker && !circuitBreaker.isAllowed()) {
      this.logger.warn(
        `Circuit breaker OPEN for consumer=${consumerName}, skipping event id=${row.id} type=${row.event_type}`,
      );
      this.metricsService.incrementProjectionConsumerSkipped(consumerName, 'circuit_open');
      // Do not mark as processed - will be retried when circuit closes
      return;
    }

    await this.dataSource.transaction(async (em) => {
      const alreadyProcessed = await this.processedEventsService.hasProcessed(
        em,
        consumerName,
        row.id,
      );
      if (alreadyProcessed) {
        return;
      }

      try {
        await projectionFn(em);
        await this.processedEventsService.markProcessed(em, consumerName, row.id, row.event_type);
        circuitBreaker?.recordSuccess();
      } catch (error) {
        this.logger.error(
          `Projection failed consumer=${consumerName} event=${row.event_type} id=${row.id}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
        // Record failure for circuit breaker
        circuitBreaker?.recordFailure();

        // Update metrics
        this.metricsService.incrementProjectionConsumerFailures(consumerName);
        this.metricsService.setProjectionConsumerState(consumerName, circuitBreaker?.getState() ?? CircuitBreakerState.CLOSED);

        // Alert if circuit just opened
        if (circuitBreaker?.getState() === CircuitBreakerState.OPEN) {
          this.logger.error(
            `ALERT: Circuit breaker OPENED for consumer=${consumerName}. Projection events will be skipped until recovery.`,
          );
          // TODO: Trigger alerting (Redis pub, Slack, etc.)
        }

        // Mark as processed to avoid infinite retries
        // TODO: Consider DLQ for failed events instead of silent skip
        await this.processedEventsService.markProcessed(em, consumerName, row.id, row.event_type);
      }
    });
  }

  private async markProcessedWithoutProjection(row: IntegrationOutbox): Promise<void> {
    // For events that don't need projection, mark as processed for all consumers
    const consumers = Object.values(PROJECTION_CONSUMERS);
    await this.dataSource.transaction(async (em) => {
      for (const consumerName of consumers) {
        await this.processedEventsService.markProcessed(em, consumerName, row.id, row.event_type);
      }
    });
  }

  private getPayload<TPayload extends object>(row: IntegrationOutbox): TPayload {
    const payload =
      unwrapCanonicalIntegrationEventPayload<TPayload>(row.payload) ?? (row.payload as TPayload);

    if (isCanonicalIntegrationEventEnvelope(row.payload)) {
      if (row.payload.eventType !== row.event_type) {
        this.logger.warn(
          `Outbox envelope eventType mismatch id=${row.id} row=${row.event_type} payload=${row.payload.eventType}`,
        );
      }
    }

    return payload;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
