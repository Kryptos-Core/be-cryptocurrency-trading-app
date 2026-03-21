/**
 * Redis Pub/Sub channel for wallet balance change events.
 * Used by WalletsService to publish and NotificationsGateway to subscribe.
 */
export const WALLET_BALANCE_EVENTS_CHANNEL = 'wallet:balance:events';

/**
 * Wallet balance change event payload interface.
 */
export interface WalletBalanceEvent {
  userId: string;
  currencyId: string;
  symbol: string;
  available: string;
  frozen: string;
  total: string;
  updatedAt: number;
}
