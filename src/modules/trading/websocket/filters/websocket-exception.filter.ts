import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WebSocketMessage } from '../../interfaces/websocket.interface';

/**
 * WebSocket Exception Filter
 * Handles errors that occur in WebSocket handlers (logs suppressed)
 */
@Catch()
export class WebSocketExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const client: Socket = host.switchToWs().getClient();
    const error = exception.getError?.() || exception;

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
