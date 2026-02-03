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
import { Logger, UseFilters, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TradingSubscriptionService } from '../services/trading-subscription.service';
import { TradingPriceStreamService } from '../services/trading-price-stream.service';
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

  private readonly logger = new Logger(TradingGateway.name);

  constructor(
    private readonly subscriptionService: TradingSubscriptionService,
    private readonly priceStreamService: TradingPriceStreamService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Initialize gateway and start listening to Redis Pub/Sub
   */
  afterInit(server: Server) {
    this.logger.log('🔌 Trading WebSocket Gateway initialized');
    
    // Listen to price updates from Redis Pub/Sub
    this.priceStreamService.onPriceUpdate((message) => {
      this.broadcastPriceUpdate(message);
    });

    // Listen to OHLC updates from Redis Pub/Sub
    this.priceStreamService.onCandleUpdate((message) => {
      this.broadcastCandleUpdate(message);
    });
  }

  /**
   * Handle client connection
   */
  async handleConnection(client: Socket) {
    this.logger.debug(`📥 Client connected: ${client.id}`);
    
    // Client must authenticate within 10 seconds
    const authTimeout = setTimeout(() => {
      if (!client.data.authenticated) {
        this.logger.warn(`⚠️ Client ${client.id} not authenticated, disconnecting`);
        client.disconnect();
      }
    }, 10000);

    client.data.authTimeout = authTimeout;
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: Socket) {
    this.logger.debug(`📤 Client disconnected: ${client.id}`);
    
    // Clean up
    clearTimeout(client.data.authTimeout);
    
    // Unsubscribe from all pairs
    if (client.data.authenticated) {
      await this.subscriptionService.unsubscribeClientFromAll(client.id);
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
      
      if (!token) {
        return this.sendError(client, 'AUTH_FAILED', 'Token is required');
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token.replace('Bearer ', ''));
      
      client.data.authenticated = true;
      client.data.user_id = payload.userId || payload.user_id;
      client.data.permissions = payload.permissions || [];

      // Clear auth timeout
      clearTimeout(client.data.authTimeout);

      this.logger.debug(`✅ Client ${client.id} authenticated as user ${payload.userId}`);

      // Send auth success response
      client.emit('auth_response', {
        type: 'auth_response',
        data: {
          success: true,
          message: 'Authentication successful',
          user_id: payload.userId,
          permissions: payload.permissions,
        },
        timestamp: Date.now(),
      } as WebSocketMessage);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid token';
      this.logger.warn(`❌ Auth failed for client ${client.id}: ${errorMessage}`);
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

      this.logger.debug(
        `📡 Client ${client.id} subscribed to pair ${pair_id} with channels: ${channels.join(', ')}`,
      );

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
      this.logger.error(`❌ Subscribe failed: ${errorMessage}`);
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

      this.logger.debug(
        `📡 Client ${client.id} unsubscribed from pair ${pair_id}`,
      );

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
   * Handle client pong response (heartbeat)
   */
  @SubscribeMessage('pong')
  handlePong(@ConnectedSocket() client: Socket) {
    client.data.last_pong = Date.now();
    this.logger.debug(`💓 Client ${client.id} sent pong`);
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

    this.logger.debug(`📊 Broadcast ticker for pair ${ticker.pair_id} to room ${room}`);
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

    this.logger.debug(
      `📊 Broadcast OHLC for pair ${candle.pair_id} (${candle.interval}) to room ${room}`,
    );
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

    this.logger.warn(`⚠️ Error sent to client ${client.id}: ${code} - ${message}`);
  }
}
