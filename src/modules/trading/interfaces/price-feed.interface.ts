import { TickerMessage } from './websocket.interface';

/**
 * Resolver to get pair_id for a symbol (e.g. from MarketRepository).
 */
export type SymbolToPairIdResolver = (symbol: string) => string | undefined;

/**
 * Price feed client interface (Strategy/Adapter Pattern).
 * Allows swapping REST polling vs WebSocket without changing the service.
 */
export interface IPriceFeedClient {
  /**
   * Connect and subscribe to the given symbols.
   * Symbols should be normalized (e.g. BTCUSDT).
   * getPairIdForSymbol is used to build TickerMessage.pair_id when emitting tickers.
   */
  connect(symbols: string[], getPairIdForSymbol: SymbolToPairIdResolver): Promise<void>;

  /**
   * Disconnect and release resources.
   */
  disconnect(): Promise<void>;

  /**
   * Register callback invoked when a ticker update is received (one listener).
   */
  onTicker(callback: (ticker: TickerMessage) => void): void;

  /**
   * Whether the client is currently connected.
   */
  isConnected(): boolean;
}
