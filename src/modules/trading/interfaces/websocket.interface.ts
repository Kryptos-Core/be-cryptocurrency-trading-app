/**
 * WebSocket Message Interfaces
 * Defines all message types for trading WebSocket protocol
 */

// ============ Message Base ============
export interface WebSocketMessage<T = any> {
  type: WebSocketMessageType;
  data?: T;
  timestamp?: number;
  error?: WebSocketError;
}

export type WebSocketMessageType =
  | 'auth'
  | 'auth_response'
  | 'subscribe'
  | 'subscribed'
  | 'unsubscribe'
  | 'unsubscribed'
  | 'ticker'
  | 'ohlc'
  | 'error'
  | 'ping'
  | 'pong';

// ============ Authentication ============
export interface AuthMessage {
  token: string;
}

export interface AuthResponseMessage {
  success: boolean;
  message: string;
  user_id?: number;
  permissions?: string[];
}

// ============ Subscription ============
export interface SubscribeMessage {
  pair_id: number;
  channels: SubscriptionChannel[];
  interval?: CandleInterval;
}

export interface SubscribedMessage {
  pair_id: number;
  channels: SubscriptionChannel[];
  interval?: CandleInterval;
  subscribed_at: number;
}

export interface UnsubscribeMessage {
  pair_id: number;
  channels: SubscriptionChannel[];
}

export interface UnsubscribedMessage {
  pair_id: number;
  channels: SubscriptionChannel[];
}

export type SubscriptionChannel = 'ticker' | 'ohlc';

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// ============ Ticker ============
export interface TickerMessage {
  pair_id: number;
  symbol: string;
  last_price: string;
  bid: string;
  ask: string;
  volume_24h: string;
  volume_24h_usd: string;
  change_24h: string;
  change_percent_24h: string;
  high_24h: string;
  low_24h: string;
  open_24h: string;
  timestamp: string;
}

// ============ OHLC Candle ============
export interface OHLCMessage {
  pair_id: number;
  /** Symbol for display (e.g. BTC/USDT) - used by TradingView chart */
  symbol?: string;
  interval: CandleInterval;
  open_time: number;
  close_time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quote_volume: string;
  trades_count: number;
  is_closed: boolean;
}

// ============ Error Handling ============
export interface WebSocketError {
  code: WebSocketErrorCode;
  message: string;
  details?: Record<string, any>;
}

export type WebSocketErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'INVALID_MESSAGE'
  | 'INVALID_PAIR'
  | 'INVALID_INTERVAL'
  | 'INVALID_CHANNEL'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SERVER_ERROR'
  | 'CONNECTION_CLOSED';

// ============ Subscription State ============
export interface ClientSubscription {
  client_id: string;
  user_id: number;
  pair_id: number;
  channels: Set<SubscriptionChannel>;
  interval?: CandleInterval;
  subscribed_at: number;
  last_update?: number;
}

export interface PriceUpdateEvent {
  pair_id: number;
  timestamp: number;
  source: 'binance' | 'internal';
  ticker: TickerMessage;
}

export interface CandleUpdateEvent {
  pair_id: number;
  timestamp: number;
  candle: OHLCMessage;
}

// ============ Redis Pub/Sub ============
export interface RedisPubSubMessage {
  event: 'price_update' | 'candle_update';
  data: PriceUpdateEvent | CandleUpdateEvent;
  timestamp: number;
}
