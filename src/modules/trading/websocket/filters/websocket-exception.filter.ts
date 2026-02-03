import { Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WebSocketMessage } from '../../interfaces/websocket.interface';

/**
 * WebSocket Exception Filter
 * Handles errors that occur in WebSocket handlers
 */
@Catch()
export class WebSocketExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WebSocketExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const client: Socket = host.switchToWs().getClient();
    const error = exception.getError?.() || exception;

    this.logger.error(`❌ WebSocket error for client ${client.id}:`, error);

    const errorResponse: WebSocketMessage = {
      type: 'error',
      error: {
        code: 'SERVER_ERROR',
        message: error.message || 'An unknown error occurred',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      },
      timestamp: Date.now(),
    };

    client.emit('error', errorResponse);
  }
}
