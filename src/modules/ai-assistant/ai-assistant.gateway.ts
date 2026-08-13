import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { StreamChatUseCase, type StreamChatEvent } from './application/use-cases/stream-chat.use-case';

const AI_ROOM = 'ai-assistant';
const AUTH_TIMEOUT_MS = 10_000;

/**
 * Socket.IO Gateway for streaming AI chat.
 *
 * Namespace: /ai-assistant
 *
 * Client flow:
 *  1. Connect to ws://<host>/ai-assistant
 *  2. Within 10s emit: { type: 'auth', data: { token: '<JWT>' } }
 *  3. Server joins client to a per-user room `user:{userId}`
 *  4. Client emits `chat:send` { conversationId?, content } → server streams back:
 *     `chat:start`, `chat:token` (multiple), `chat:tool_call`, `chat:tool_result`, `chat:done` / `chat:error`.
 *  5. Client can emit `chat:stop` to abort the current stream.
 */
@WebSocketGateway({
  namespace: 'ai-assistant',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 30000,
  pingTimeout: 60000,
})
export class AiAssistantGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AiAssistantGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly streamChat: StreamChatUseCase,
  ) {}

  handleConnection(client: Socket) {
    const timer = setTimeout(() => {
      if (!client.data.authenticated) {
        client.emit('auth_response', { success: false, message: 'Auth timeout' });
        client.disconnect();
      }
    }, AUTH_TIMEOUT_MS);
    client.data.authTimeout = timer;
  }

  handleDisconnect(client: Socket) {
    clearTimeout(client.data.authTimeout);
    const controller = client.data.abortController as AbortController | undefined;
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
  }

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
      const cleanToken = token.replace(/^Bearer\s+/i, '');
      const payload = await this.jwtService.verifyAsync(cleanToken);
      const userId: string = payload.userId || payload.user_id || payload.sub;
      client.data.authenticated = true;
      client.data.user_id = userId;
      clearTimeout(client.data.authTimeout);
      client.join(AI_ROOM);
      client.join(`user:${userId}`);
      client.emit('auth_response', {
        type: 'auth_response',
        data: { success: true, message: 'Authenticated', user_id: userId },
        timestamp: Date.now(),
      });
    } catch (err) {
      client.emit('auth_response', { success: false, message: (err as Error).message });
      client.disconnect();
    }
  }

  @SubscribeMessage('chat:send')
  async handleChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: {
      data?: { conversationId?: string; content?: string; messageId?: string };
    },
  ) {
    if (!client.data.authenticated || !client.data.user_id) {
      client.emit('chat:error', { code: 'UNAUTHENTICATED', message: 'Authenticate first' });
      return;
    }
    const userId = client.data.user_id as string;
    const content = (message?.data?.content ?? '').trim();
    if (!content) {
      client.emit('chat:error', { code: 'EMPTY_MESSAGE', message: 'Empty message' });
      return;
    }

    const existingController = client.data.abortController as AbortController | undefined;
    if (existingController && !existingController.signal.aborted) {
      client.emit('chat:error', { code: 'STREAM_BUSY', message: 'Có stream đang chạy' });
      return;
    }

    const controller = new AbortController();
    client.data.abortController = controller;

    try {
      await this.streamChat.execute({
        userId,
        conversationId: message?.data?.conversationId,
        userText: content,
        signal: controller.signal,
        onEvent: (event: StreamChatEvent) => this.emitToClient(client, event),
      });
    } catch (err) {
      this.logger.error(`chat:send failed for ${userId}: ${(err as Error).message}`);
      client.emit('chat:error', { code: 'INTERNAL_ERROR', message: (err as Error).message });
    } finally {
      client.data.abortController = undefined;
    }
  }

  @SubscribeMessage('chat:stop')
  async handleChatStop(@ConnectedSocket() client: Socket) {
    if (!client.data.authenticated) {
      client.emit('chat:error', { code: 'UNAUTHENTICATED', message: 'Authenticate first' });
      return;
    }
    const controller = client.data.abortController as AbortController | undefined;
    if (controller && !controller.signal.aborted) {
      controller.abort();
    } else {
      client.emit('chat:done', { aborted: true });
    }
  }

  private emitToClient(client: Socket, event: StreamChatEvent) {
    const payload = {
      type: event.type,
      data: event,
      timestamp: Date.now(),
    };
    if (event.type === 'token') {
      client.emit('chat:token', { delta: event.delta });
      return;
    }
    if (event.type === 'tool_call') {
      client.emit('chat:tool_call', { name: event.name, args: event.args });
      return;
    }
    if (event.type === 'tool_result') {
      client.emit('chat:tool_result', { name: event.name, result: event.result });
      return;
    }
    client.emit(`chat:${event.type}`, payload);
  }
}
