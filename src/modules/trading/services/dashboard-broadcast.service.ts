import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Server } from 'socket.io';
import { TradingPriceStreamService } from './trading-price-stream.service';
import { TickerMessage } from '../interfaces/websocket.interface';

const BROADCAST_INTERVAL_MS = 5_000; // broadcast to dashboard room every 5 seconds
const DASHBOARD_ROOM = 'dashboard';

/**
 * Dashboard Broadcast Service
 *
 * Observer Pattern implementation:
 *   - Registers itself as a listener on TradingPriceStreamService (Observable)
 *   - Buffers incoming ticker updates in an in-memory Map (latest price per symbol)
 *   - Every BROADCAST_INTERVAL_MS, emits the buffered batch to Socket.IO room 'dashboard'
 *
 * This decouples the high-frequency Binance price feed from dashboard clients:
 * thousands of ticker updates per second are throttled to one broadcast every 5 seconds.
 */
@Injectable()
export class DashboardBroadcastService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DashboardBroadcastService.name);

  /** Latest ticker per symbol, updated on every price update event */
  private readonly tickerBuffer = new Map<string, TickerMessage>();

  /** Socket.IO server reference, set from TradingGateway.afterInit() */
  private server: Server | null = null;

  private broadcastTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly priceStreamService: TradingPriceStreamService) {}

  onModuleInit(): void {
    // Register as Observer on TradingPriceStreamService
    this.priceStreamService.onPriceUpdate((ticker: TickerMessage) => {
      this.tickerBuffer.set(ticker.symbol, ticker);
    });

    // Throttled broadcast loop
    this.broadcastTimer = setInterval(() => this.flush(), BROADCAST_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    this.tickerBuffer.clear();
  }

  /**
   * Called from TradingGateway.afterInit() to inject the Socket.IO server instance.
   */
  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * Returns a snapshot of all currently buffered tickers.
   * Used by TradingGateway.handleJoinDashboard() to send an immediate snapshot
   * to a newly connected client without waiting for the next 5s interval.
   */
  getSnapshot(): TickerMessage[] {
    return Array.from(this.tickerBuffer.values());
  }

  /**
   * Flushes the ticker buffer to the dashboard Socket.IO room.
   * Socket.IO handles empty-room emissions as a no-op, so no explicit
   * room-membership check is needed (and avoids touching adapter internals
   * before they are fully initialised).
   */
  private flush(): void {
    if (!this.server || this.tickerBuffer.size === 0) return;

    try {
      const tickers = Array.from(this.tickerBuffer.values());
      this.tickerBuffer.clear();

      this.server.to(DASHBOARD_ROOM).emit('dashboard_tickers', {
        type: 'dashboard_tickers',
        data: tickers,
        timestamp: Date.now(),
      });
    } catch (err) {
      this.logger.warn(
        `DashboardBroadcastService flush error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
