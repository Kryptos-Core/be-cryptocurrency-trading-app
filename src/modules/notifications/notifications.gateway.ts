import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { UseFilters, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '@/common/services/redis.service';
import { NOTIFICATIONS_CHANNEL } from './notifications.service';
import { PAYMENT_CONFIG_EVENTS_CHANNEL } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';
import { WebSocketExceptionFilter } from '@/modules/trading/websocket/filters/websocket-exception.filter';

const NOTIFICATIONS_ROOM = 'notifications';

/**
 * Notifications WebSocket Gateway
 * Namespace: /notifications
 * Observer Pattern: subscribes to Redis channel, broadcasts to all connected authenticated clients.
 *
 * Client flow:
 *  1. Connect to ws://<host>/notifications
 *  2. Within 10s emit: { type: 'auth', data: { token: '<JWT>' } }
 *  3. Server joins client to 'notifications' room
 *  4. On new broadcast → server emits 'notification:new' to room
 */
@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 30000,
  pingTimeout: 60000,
})
@UseFilters(WebSocketExceptionFilter)
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnApplicationBootstrap
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  afterInit() {
    this.logger.log('NotificationsGateway initialized');
  }

  /**
   * Subscribe to Redis Pub/Sub channel AFTER all modules (including RedisModule)
   * have fully initialized via onModuleInit(). This avoids the race condition
   * where afterInit() fires before RedisService.subscriber is ready.
   */
  async onApplicationBootstrap() {
    await this.redisService.subscribe(NOTIFICATIONS_CHANNEL, (message) => {
      try {
        const payload = JSON.parse(message);
        this.server.to(NOTIFICATIONS_ROOM).emit('notification:new', {
          type: 'notification:new',
          data: payload,
          timestamp: Date.now(),
        });
        this.logger.debug(`Broadcast notification: ${payload.notification_id}`);
      } catch (error) {
        this.logger.error('Failed to parse/broadcast notification', error);
      }
    });

    await this.redisService.subscribe(PAYMENT_CONFIG_EVENTS_CHANNEL, (message) => {
      try {
        const payload = JSON.parse(message);
        this.server.to(NOTIFICATIONS_ROOM).emit('payment_config:event', {
          type: 'payment_config:event',
          data: payload,
          timestamp: Date.now(),
        });
        this.logger.debug(
          `Broadcast payment config event: ${payload.event} for ${payload.type}/${payload.network}`,
        );
      } catch (error) {
        this.logger.error('Failed to parse/broadcast payment config event', error);
      }
    });

    this.logger.log('NotificationsGateway subscribed to Redis channels (notifications + payment_config)');
  }

  handleConnection(client: Socket) {
    const authTimeout = setTimeout(() => {
      if (!client.data.authenticated) {
        client.disconnect();
      }
    }, 10000);
    client.data.authTimeout = authTimeout;
  }

  handleDisconnect(client: Socket) {
    clearTimeout(client.data.authTimeout);
  }

  /**
   * Client sends: { type: 'auth', data: { token: '<JWT>' } }
   */
  @SubscribeMessage('auth')
  async handleAuth(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: { data?: { token?: string } },
  ) {
    try {
      const token = message?.data?.token;
      if (!token) {
        client.emit('auth_response', { success: false, message: 'Token required' });
        return;
      }

      const cleanToken = token.replace('Bearer ', '');
      const payload = await this.jwtService.verifyAsync(cleanToken);
      client.data.authenticated = true;
      client.data.user_id = payload.userId || payload.user_id || payload.sub;
      clearTimeout(client.data.authTimeout);

      client.join(NOTIFICATIONS_ROOM);

      client.emit('auth_response', {
        type: 'auth_response',
        data: { success: true, message: 'Authenticated', user_id: client.data.user_id },
        timestamp: Date.now(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Invalid token';
      client.emit('auth_response', { success: false, message: msg });
      client.disconnect();
    }
  }
}
