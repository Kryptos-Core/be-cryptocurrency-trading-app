import { Logger } from '@nestjs/common';
import WebSocket from 'ws';
import { TickerMessage, OHLCMessage, CandleInterval } from '../interfaces/websocket.interface';
import {
  IPriceFeedClient,
  SymbolToPairIdResolver,
} from '../interfaces/price-feed.interface';

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443';
/** Max symbols in combined stream URL; beyond this URL can exceed server limit (414 URI Too Long). */
const MAX_SYMBOLS_FOR_COMBINED_STREAM = 200;
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 60_000;
const RATE_LIMIT_LOG_MS = 60_000;
/** Binance closes connections after 24h; reconnect before that. */
const CONNECTION_MAX_AGE_MS = 23 * 60 * 60 * 1000;
const KLINE_INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

/** Binance 24hr ticker stream payload (single symbol). */
interface BinanceTickerPayload {
  e: string;
  E: number;
  s: string;
  p: string;
  P: string;
  w?: string;
  c: string;
  Q?: string;
  o?: string;
  h: string;
  l: string;
  v: string;
  q: string;
  O?: number;
  C?: number;
  F?: number;
  L?: number;
  n?: number;
  b?: string;
  a?: string;
}

/** Combined stream message: { stream, data }. */
interface BinanceCombinedMessage {
  stream: string;
  data: BinanceTickerPayload | BinanceKlinePayload;
}

/** Binance kline stream data (data.k). */
interface BinanceKlinePayload {
  e: string;
  E: number;
  s: string;
  k: {
    t: number;
    T: number;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    n: number;
    x: boolean;
    q?: string;
  };
}

/**
 * Binance WebSocket Price Feed Client.
 * Connects to combined ticker stream, parses messages, emits TickerMessage.
 * Reconnects with exponential backoff on close/error.
 */
export class BinanceWebSocketPriceFeedClient implements IPriceFeedClient {
  private readonly logger = new Logger(BinanceWebSocketPriceFeedClient.name);
  private ws: WebSocket | null = null;
  private tickerCallback: ((ticker: TickerMessage) => void) | null = null;
  private candleCallback: ((candle: OHLCMessage) => void) | null = null;
  private symbols: string[] = [];
  private klineSymbols: string[] = [];
  private trackedSymbolSet: Set<string> = new Set();
  private useAllTickerStream = false;
  private getPairIdForSymbol: SymbolToPairIdResolver = () => undefined;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private proactiveReconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private lastLogAt: Record<string, number> = {};
  private destroyed = false;

  private shouldLog(key: string, windowMs: number = RATE_LIMIT_LOG_MS): boolean {
    const now = Date.now();
    if (now - (this.lastLogAt[key] ?? 0) < windowMs) return false;
    this.lastLogAt[key] = now;
    return true;
  }

  onTicker(callback: (ticker: TickerMessage) => void): void {
    this.tickerCallback = callback;
  }

  onCandle(callback: (candle: OHLCMessage) => void): void {
    this.candleCallback = callback;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(
    symbols: string[],
    getPairIdForSymbol: SymbolToPairIdResolver,
    options?: { klineSymbols?: string[] },
  ): Promise<void> {
    if (symbols.length === 0 && (options?.klineSymbols?.length ?? 0) === 0) {
      this.logger.warn('Connect called with no symbols; skipping.');
      return;
    }
    this.symbols = symbols;
    this.klineSymbols = options?.klineSymbols ?? [];
    this.trackedSymbolSet = new Set(symbols.map((s) => s.toUpperCase()));
    this.useAllTickerStream =
      this.klineSymbols.length === 0 && symbols.length > MAX_SYMBOLS_FOR_COMBINED_STREAM;
    this.getPairIdForSymbol = getPairIdForSymbol;
    this.destroyed = false;
    this.reconnectAttempt = 0;
    await this.connectInternal();
  }

  private buildUrl(): string {
    const parts: string[] = [];
    if (this.useAllTickerStream) {
      return `${BINANCE_WS_BASE}/ws/!ticker@arr`;
    }
    for (const s of this.symbols) {
      parts.push(`${s.toLowerCase()}@ticker`);
    }
    for (const s of this.klineSymbols) {
      const sym = s.toLowerCase();
      for (const interval of KLINE_INTERVALS) {
        parts.push(`${sym}@kline_${interval}`);
      }
    }
    if (parts.length === 0) return `${BINANCE_WS_BASE}/ws/!ticker@arr`;
    return `${BINANCE_WS_BASE}/stream?streams=${parts.join('/')}`;
  }

  private payloadToCandle(stream: string, data: BinanceKlinePayload): OHLCMessage | null {
    const pairId = this.getPairIdForSymbol(data.s);
    if (!pairId) return null;
    const match = /kline_(.+)$/.exec(stream);
    const interval = (match?.[1] ?? '1m') as CandleInterval;
    const k = data.k;
    return {
      pair_id: pairId,
      symbol: data.s,
      interval,
      open_time: k.t,
      close_time: k.T,
      open: String(k.o ?? '0'),
      high: String(k.h ?? '0'),
      low: String(k.l ?? '0'),
      close: String(k.c ?? '0'),
      volume: String(k.v ?? '0'),
      quote_volume: String(k.q ?? '0'),
      trades_count: k.n ?? 0,
      is_closed: Boolean(k.x),
    };
  }

  private payloadToTicker(data: BinanceTickerPayload): TickerMessage | null {
    const pairId = this.getPairIdForSymbol(data.s);
    if (!pairId) return null;
    return {
      pair_id: pairId,
      symbol: data.s,
      last_price: String(data.c ?? '0'),
      bid: String(data.b ?? '0'),
      ask: String(data.a ?? '0'),
      volume_24h: String(data.v ?? '0'),
      volume_24h_usd: String(data.q ?? '0'),
      change_24h: String(data.p ?? '0'),
      change_percent_24h: String(data.P ?? '0'),
      high_24h: String(data.h ?? '0'),
      low_24h: String(data.l ?? '0'),
      open_24h: String(data.o ?? '0'),
      timestamp: String(Date.now()),
    };
  }

  private async connectInternal(): Promise<void> {
    if (this.destroyed || (this.symbols.length === 0 && this.klineSymbols.length === 0)) return;

    const url = this.buildUrl();
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          this.reconnectAttempt = 0;
          if (this.proactiveReconnectTimer) {
            clearTimeout(this.proactiveReconnectTimer);
            this.proactiveReconnectTimer = null;
          }
          this.proactiveReconnectTimer = setTimeout(() => {
            this.proactiveReconnectTimer = null;
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.logger.log('Proactive reconnect before 24h limit');
              this.ws.close();
            }
          }, CONNECTION_MAX_AGE_MS);
          this.logger.log(
            this.useAllTickerStream
              ? `Binance WebSocket connected; stream=!ticker@arr (${this.symbols.length} symbols tracked)`
              : `Binance WebSocket connected; streams: ${this.symbols.join(', ')}`,
          );
          resolve();
        });

        this.ws.on('message', (raw: Buffer) => {
          try {
            const parsed = JSON.parse(raw.toString());
            if (this.useAllTickerStream && Array.isArray(parsed)) {
              for (const data of parsed as BinanceTickerPayload[]) {
                if (!data?.s || !this.trackedSymbolSet.has(data.s)) continue;
                const ticker = this.payloadToTicker(data);
                if (ticker) this.tickerCallback?.(ticker);
              }
              return;
            }
            const msg = parsed as BinanceCombinedMessage;
            if (!msg.stream || !msg.data) return;
            if (msg.stream.includes('kline')) {
              const klineData = msg.data as BinanceKlinePayload;
              if (klineData?.k) {
                const candle = this.payloadToCandle(msg.stream, klineData);
                if (candle) this.candleCallback?.(candle);
              }
            } else {
              const ticker = this.payloadToTicker(msg.data as BinanceTickerPayload);
              if (ticker) this.tickerCallback?.(ticker);
            }
          } catch (err) {
            if (this.shouldLog('parse')) {
              this.logger.warn(
                'Binance WS message parse failed',
                err instanceof Error ? err.stack : String(err),
              );
            }
          }
        });

        this.ws.on('error', (err: Error) => {
          if (this.shouldLog('ws_error')) {
            this.logger.error(
              'Binance WebSocket error',
              err?.message ?? String(err),
            );
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.ws = null;
          if (this.proactiveReconnectTimer) {
            clearTimeout(this.proactiveReconnectTimer);
            this.proactiveReconnectTimer = null;
          }
          if (this.destroyed) {
            resolve();
            return;
          }
          if (this.shouldLog('close')) {
            this.logger.warn(
              `Binance WebSocket closed code=${code} reason=${reason?.toString() || 'none'}; reconnecting...`,
            );
          }
          this.scheduleReconnect();
          resolve();
        });
      } catch (err) {
        if (this.shouldLog('connect')) {
          this.logger.error(
            'Binance WebSocket connect failed',
            err instanceof Error ? err.stack : String(err),
          );
        }
        this.scheduleReconnect();
        resolve();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_INITIAL_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt += 1;
    const jitter = Math.floor(delay * 0.2 * Math.random());
    const withJitter = delay + jitter;
    this.logger.log(
      `Reconnecting in ${(withJitter / 1000).toFixed(1)}s (attempt ${this.reconnectAttempt})`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectInternal();
    }, withJitter);
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.proactiveReconnectTimer) {
      clearTimeout(this.proactiveReconnectTimer);
      this.proactiveReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.tickerCallback = null;
    this.candleCallback = null;
    this.logger.log('Binance WebSocket disconnected');
  }
}
