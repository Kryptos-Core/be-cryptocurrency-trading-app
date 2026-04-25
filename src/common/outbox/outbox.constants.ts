export const OUTBOX_RELAY_QUEUE = 'outbox-relay';

/** DI token for publishing outbox rows to external event infrastructure (Kafka, etc.). */
export const OUTBOX_EVENT_PUBLISHER = Symbol('OUTBOX_EVENT_PUBLISHER');

export const DEFAULT_OUTBOX_EVENT_PUBLISHER_DRIVER = 'noop';
