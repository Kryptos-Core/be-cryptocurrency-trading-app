export const OUTBOX_ALERTS_CHANNEL_DEFAULT = 'outbox:alerts';

export type OutboxRelayAlertSeverity = 'none' | 'warning' | 'critical';

export type OutboxRelayAlertStateChangedEvent = {
  event: 'outbox.relay.alert_state_changed';
  checkedAt: string;
  previousSeverity: OutboxRelayAlertSeverity;
  currentSeverity: OutboxRelayAlertSeverity;
  publisherDriver: string;
  reasons: string[];
  health: {
    unpublishedBacklog: number;
    deadLetterRows: number;
    retryScheduledRows: number;
    oldestUnpublishedAgeSeconds: number;
    oldestDeadLetterAgeSeconds: number;
  };
  thresholds: {
    warning: {
      maxDeadLetterRows: number;
      maxOldestUnpublishedAgeSeconds: number;
      maxOldestDeadLetterAgeSeconds: number;
    };
    critical: {
      maxDeadLetterRows: number;
      maxOldestUnpublishedAgeSeconds: number;
      maxOldestDeadLetterAgeSeconds: number;
    };
  };
};
