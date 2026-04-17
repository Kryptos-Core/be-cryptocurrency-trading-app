/**
 * Contract for idempotent read-side projection from integration events (after outbox relay).
 */
export interface ReadModelProjectorContext {
  readonly outboxId: string;
}

export interface ReadModelProjector<TPayload = unknown> {
  /** Must match `IntegrationEventType` / outbox aggregate_type for routing */
  readonly eventType: string;

  project(payload: TPayload, ctx: ReadModelProjectorContext): Promise<void>;
}
