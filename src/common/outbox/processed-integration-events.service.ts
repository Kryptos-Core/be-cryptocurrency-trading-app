import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ProcessedIntegrationEvent } from '@/entities/processed-integration-event.entity';

@Injectable()
export class ProcessedIntegrationEventsService {
  private readonly logger = new Logger(ProcessedIntegrationEventsService.name);

  async hasProcessed(em: EntityManager, consumerName: string, eventId: string): Promise<boolean> {
    const existing = await em.getRepository(ProcessedIntegrationEvent).findOne({
      where: {
        consumer_name: consumerName,
        event_id: eventId,
      },
      select: ['id'],
    });

    return !!existing;
  }

  async markProcessed(
    em: EntityManager,
    consumerName: string,
    eventId: string,
    eventType: string,
  ): Promise<void> {
    const repo = em.getRepository(ProcessedIntegrationEvent);
    const entity = repo.create({
      consumer_name: consumerName,
      event_id: eventId,
      event_type: eventType,
    });

    try {
      await repo.insert(entity);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('duplicate') ||
        message.includes('Duplicate') ||
        message.includes('unique')
      ) {
        this.logger.debug(
          `Processed integration event already marked consumer=${consumerName} eventId=${eventId}`,
        );
        return;
      }
      throw error;
    }
  }

  async runOnce<T>(
    em: EntityManager,
    consumerName: string,
    eventId: string,
    eventType: string,
    callback: () => Promise<T>,
  ): Promise<{ skipped: boolean; result?: T }> {
    if (await this.hasProcessed(em, consumerName, eventId)) {
      return { skipped: true };
    }

    const result = await callback();
    await this.markProcessed(em, consumerName, eventId, eventType);
    return { skipped: false, result };
  }
}
