export const EXCHANGE_RATE_ALERTS_CHANNEL = 'exchange-rate:alerts';

export interface ExchangeRateAutoSyncAlertEvent {
  event: 'exchange_rate.auto_sync.threshold_alert';
  source: 'coingecko' | 'exchangerate_host';
  previousRate: string;
  newRate: string;
  changePct: string;
  thresholdPct: string;
  intervalMinutes: number;
  lastSyncAt: string;
  nextDueAt: string;
  timestamp: string;
}
