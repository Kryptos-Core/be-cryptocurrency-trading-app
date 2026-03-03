import { Logger } from '@nestjs/common';
import WebSocket from 'ws';
import { TickerMessage } from '../interfaces/websocket.interface';
import {
  IPriceFeedClient,
  SymbolToPairIdResolver,
} from '../interfaces/price-feed.interface';

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443';
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 60_000;
const RATE_LIMIT_LOG_MS = 60_000;

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
  data: BinanceTickerPayload;
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
  private symbols: string[] = [];
  private getPairIdForSymbol: SymbolToPairIdResolver = () => undefined;
  private reconnectTimer: NodeJS.Timeout | null = null;
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

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(
    symbols: string[],
    getPairIdForSymbol: SymbolToPairIdResolver,
  ): Promise<void> {
    if (symbols.length === 0) {
      this.logger.warn('Connect called with no symbols; skipping.');
      return;
    }
    this.symbols = symbols;
    this.getPairIdForSymbol = getPairIdForSymbol;
    this.destroyed = false;
    this.reconnectAttempt = 0;
    await this.connectInternal();
  }

  private buildUrl(): string {
    const streams = this.symbols
      .map((s) => `${s.toLowerCase()}@ticker`)
      .join('/');
    return `${BINANCE_WS_BASE}/stream?streams=${streams}`;
  }

  private async connectInternal(): Promise<void> {
    if (this.destroyed || this.symbols.length === 0) return;

    const url = this.buildUrl();
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          this.reconnectAttempt = 0;
          this.logger.log(
            `Binance WebSocket connected; streams: ${this.symbols.join(', ')}`,
          );
          resolve();
        });

        this.ws.on('message', (raw: Buffer) => {
          try {
            const msg = JSON.parse(raw.toString()) as BinanceCombinedMessage;
            if (!msg.stream || !msg.data) return;
            const pairId = this.getPairIdForSymbol(msg.data.s);
            if (!pairId) return;
            const ticker: TickerMessage = {
              pair_id: pairId,
              symbol: msg.data.s,
              last_price: String(msg.data.c ?? '0'),
              bid: String(msg.data.b ?? '0'),
              ask: String(msg.data.a ?? '0'),
              volume_24h: String(msg.data.v ?? '0'),
              volume_24h_usd: String(msg.data.q ?? '0'),
              change_24h: String(msg.data.p ?? '0'),
              change_percent_24h: String(msg.data.P ?? '0'),
              high_24h: String(msg.data.h ?? '0'),
              low_24h: String(msg.data.l ?? '0'),
              open_24h: String(msg.data.o ?? '0'),
              timestamp: String(Date.now()),
            };
            this.tickerCallback?.(ticker);
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
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.tickerCallback = null;
    this.logger.log('Binance WebSocket disconnected');
  }
}
