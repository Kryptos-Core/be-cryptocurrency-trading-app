import { newUuid } from '@/common/utils/uuid.util';

export interface CanonicalIntegrationEventEnvelope<TPayload extends object> {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  schemaVersion: number;
  payload: TPayload;
  correlationId?: string;
  causationId?: string;
  idempotencyKey?: string;
  partitionKey?: string;
}

export interface BuildCanonicalIntegrationEventEnvelopeInput<TPayload extends object> {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  schemaVersion?: number;
  correlationId?: string;
  causationId?: string;
  idempotencyKey?: string;
  partitionKey?: string;
  occurredAt?: Date;
}

export function buildCanonicalIntegrationEventEnvelope<TPayload extends object>(
  input: BuildCanonicalIntegrationEventEnvelopeInput<TPayload>,
): CanonicalIntegrationEventEnvelope<TPayload> {
  const occurredAt = input.occurredAt ?? new Date();

  return {
    eventId: newUuid(),
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    occurredAt: occurredAt.toISOString(),
    schemaVersion: input.schemaVersion ?? 1,
    payload: input.payload,
    correlationId: input.correlationId,
    causationId: input.causationId,
    idempotencyKey: input.idempotencyKey,
    partitionKey: input.partitionKey,
  };
}

export function isCanonicalIntegrationEventEnvelope(
  value: unknown,
): value is CanonicalIntegrationEventEnvelope<Record<string, unknown>> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.eventId === 'string' &&
    typeof candidate.eventType === 'string' &&
    typeof candidate.aggregateType === 'string' &&
    typeof candidate.aggregateId === 'string' &&
    typeof candidate.occurredAt === 'string' &&
    typeof candidate.schemaVersion === 'number' &&
    !!candidate.payload &&
    typeof candidate.payload === 'object' &&
    !Array.isArray(candidate.payload)
  );
}

export function unwrapCanonicalIntegrationEventPayload<TPayload extends object>(
  value: unknown,
): TPayload | null {
  if (!isCanonicalIntegrationEventEnvelope(value)) {
    return null;
  }

  return value.payload as TPayload;
}
