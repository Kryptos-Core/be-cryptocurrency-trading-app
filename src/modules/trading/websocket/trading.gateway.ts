import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseFilters } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TradingSubscriptionService } from '../services/trading-subscription.service';
import { TradingPriceStreamService } from '../services/trading-price-stream.service';
import { BinancePriceFeedService } from '../services/binance-price-feed.service';
import { DashboardBroadcastService } from '../services/dashboard-broadcast.service';
import {
  WebSocketMessage,
  AuthMessage,
  SubscribeMessage as SubscribePayload,
  UnsubscribeMessage,
  TickerMessage,
  OHLCMessage,
  WebSocketErrorCode,
} from '../interfaces/websocket.interface';
import { JwtService } from '@nestjs/jwt';
import { WebSocketExceptionFilter } from './filters/websocket-exception.filter';

/**
 * Trading WebSocket Gateway
 * Handles real-time trading data streaming (ticker, OHLC candles)
 * 
 * Connection Flow:
 * 1. Client connects to ws://localhost:3000/trading
 * 2. Client sends auth message with JWT token
 * 3. Client sends subscribe message with pair_id and channels
 * 4. Server starts streaming ticker and OHLC updates
 * 5. Server sends periodic ping messages (heartbeat)
 * 6. Client responds with pong
 */
@WebSocketGateway({
  namespace: 'trading',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 30000, // 30 seconds
  pingTimeout: 60000, // 60 seconds
  maxHttpBufferSize: 1e6, // 1MB
})
@UseFilters(WebSocketExceptionFilter)
export class TradingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly subscriptionService: TradingSubscriptionService,
    private readonly priceStreamService: TradingPriceStreamService,
    private readonly binancePriceFeedService: BinancePriceFeedService,
    private readonly dashboardBroadcastService: DashboardBroadcastService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Initialize gateway and start listening to Redis Pub/Sub
   */
  afterInit(server: Server) {
    // Listen to price updates from Redis Pub/Sub
    this.priceStreamService.onPriceUpdate((message: TickerMessage) => {
      this.broadcastPriceUpdate(message);
    });

    // Listen to OHLC updates from Redis Pub/Sub
    this.priceStreamService.onCandleUpdate((message: OHLCMessage) => {
      this.broadcastCandleUpdate(message);
    });

    // Inject server into DashboardBroadcastService for room-based broadcasting
    this.dashboardBroadcastService.setServer(server);
  }

  /**
   * Handle client connection
   */
  async handleConnection(client: Socket) {
    // Client must authenticate within 10 seconds
    const authTimeout = setTimeout(() => {
      if (!client.data.authenticated) client.disconnect();
    }, 10000);

    client.data.authTimeout = authTimeout;
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: Socket) {
    clearTimeout(client.data.authTimeout);
    client.rooms.forEach((room: string) => {
      if (room !== client.id) client.leave(room);
    });
    // Unsubscribe from all pairs
    if (client.data.authenticated) {
      await this.subscriptionService.unsubscribeClientFromAll(client.id);
      await this.binancePriceFeedService.requestSymbolsForSubscriptions();
    }
  }

  /**
   * Handle authentication message
   * Client sends: { type: 'auth', data: { token: 'JWT...' } }
   */
  @SubscribeMessage('auth')
  async handleAuth(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: WebSocketMessage<AuthMessage>,
  ) {
    try {
      const token = message.data?.token;
      
      if (!token) return this.sendError(client, 'AUTH_FAILED', 'Token is required');

      // Verify JWT token
      const cleanToken = token.replace('Bearer ', '');
      const payload = await this.jwtService.verifyAsync(cleanToken);
      client.data.authenticated = true;
      client.data.user_id = payload.userId || payload.user_id || payload.sub;
      client.data.permissions = payload.permissions || [];
      clearTimeout(client.data.authTimeout);

      // Send auth success response
      client.emit('auth_response', {
        type: 'auth_response',
        data: {
          success: true,
          message: 'Authentication successful',
          user_id: payload.userId || payload.user_id || payload.sub,
          permissions: payload.permissions,
        },
        timestamp: Date.now(),
      } as WebSocketMessage);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid token';
      return this.sendError(client, 'AUTH_FAILED', errorMessage);
    }
  }

  /**
   * Handle subscribe message
   * Client sends: { type: 'subscribe', data: { pair_id: 1, channels: ['ticker', 'ohlc'], interval: '1h' } }
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: WebSocketMessage<SubscribePayload>,
  ) {
    try {
      // Check authentication
      if (!client.data.authenticated) {
        return this.sendError(client, 'AUTH_REQUIRED', 'Please authenticate first');
      }

      const { pair_id, channels, interval } = message.data || {};

      if (!pair_id || !channels || !Array.isArray(channels)) {
        return this.sendError(client, 'INVALID_MESSAGE', 'pair_id and channels are required');
      }

      // Validate interval for OHLC subscription
      if (channels.includes('ohlc') && !interval) {
        return this.sendError(client, 'INVALID_MESSAGE', 'interval is required for ohlc channel');
      }

      // Subscribe client to pair
      await this.subscriptionService.subscribe(
        client.id,
        client.data.user_id,
        pair_id,
        channels,
        interval,
      );
      await this.binancePriceFeedService.requestSymbolsForSubscriptions();

      // Join Socket.IO rooms for each channel
      for (const channel of channels) {
        let room = '';
        if (channel === 'ticker') {
          room = `pair:${pair_id}:ticker`;
        } else if (channel === 'ohlc') {
          room = `pair:${pair_id}:ohlc:${interval}`;
        }
        
        if (room) client.join(room);
      }
      // Send subscription confirmation
      client.emit('subscribed', {
        type: 'subscribed',
        data: {
          pair_id,
          channels,
          interval,
          subscribed_at: Date.now(),
        },
        timestamp: Date.now(),
      } as WebSocketMessage);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Subscription failed';
      return this.sendError(client, 'SERVER_ERROR', errorMessage);
    }
  }

  /**
   * Handle unsubscribe message
   */
  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: WebSocketMessage<UnsubscribeMessage>,
  ) {
    try {
      if (!client.data.authenticated) {
        return this.sendError(client, 'AUTH_REQUIRED', 'Please authenticate first');
      }

      const { pair_id, channels } = message.data || {};

      if (!pair_id || !channels) {
        return this.sendError(client, 'INVALID_MESSAGE', 'pair_id and channels are required');
      }

      // Unsubscribe client from pair
      await this.subscriptionService.unsubscribe(client.id, pair_id, channels);
      await this.binancePriceFeedService.requestSymbolsForSubscriptions();

      // Leave Socket.IO rooms for each channel
      for (const channel of channels) {
        let room = '';
        if (channel === 'ticker') {
          room = `pair:${pair_id}:ticker`;
        } else if (channel === 'ohlc') {
          // Note: For OHLC, we'd need the interval, but it's not provided in unsubscribe
          // Leave all OHLC intervals for this pair
          const rooms = client.rooms;
          for (const r of rooms) {
            if (r.startsWith(`pair:${pair_id}:ohlc:`)) client.leave(r);
          }
          continue;
        }
        if (room) client.leave(room);
      }
      // Send unsubscription confirmation
      client.emit('unsubscribed', {
        type: 'unsubscribed',
        data: {
          pair_id,
          channels,
        },
        timestamp: Date.now(),
      } as WebSocketMessage);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unsubscription failed';
      return this.sendError(client, 'SERVER_ERROR', errorMessage);
    }
  }

  /**
   * Handle dashboard room join.
   * Client sends: { type: 'join_dashboard' }
   * Server: joins room 'dashboard', emits immediate ticker snapshot.
   * Auth not required — top market data is public.
   */
  @SubscribeMessage('join_dashboard')
  handleJoinDashboard(@ConnectedSocket() client: Socket) {
    client.join('dashboard');
    const snapshot = this.dashboardBroadcastService.getSnapshot();
    client.emit('dashboard_tickers', {
      type: 'dashboard_tickers',
      data: snapshot,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle dashboard room leave.
   * Client sends: { type: 'leave_dashboard' }
   */
  @SubscribeMessage('leave_dashboard')
  handleLeaveDashboard(@ConnectedSocket() client: Socket) {
    client.leave('dashboard');
  }

  /**
   * Handle client pong response (heartbeat)
   */
  @SubscribeMessage('pong')
  handlePong(@ConnectedSocket() client: Socket) {
    client.data.last_pong = Date.now();
  }

  /**
   * Broadcast ticker update to subscribed clients
   */
  private broadcastPriceUpdate(ticker: TickerMessage) {
    const room = `pair:${ticker.pair_id}:ticker`;
    
    this.server.to(room).emit('ticker', {
      type: 'ticker',
      data: ticker,
      timestamp: Date.now(),
    } as WebSocketMessage<TickerMessage>);
  }

  /**
   * Broadcast OHLC candle update to subscribed clients
   */
  private broadcastCandleUpdate(candle: OHLCMessage) {
    const room = `pair:${candle.pair_id}:ohlc:${candle.interval}`;
    
    this.server.to(room).emit('ohlc', {
      type: 'ohlc',
      data: candle,
      timestamp: Date.now(),
    } as WebSocketMessage<OHLCMessage>);
  }

  /**
   * Send error message to client
   */
  private sendError(
    client: Socket,
    code: WebSocketErrorCode,
    message: string,
    details?: Record<string, any>,
  ) {
    client.emit('error', {
      type: 'error',
      error: {
        code,
        message,
        details,
      },
      timestamp: Date.now(),
    } as WebSocketMessage);
  }
}
