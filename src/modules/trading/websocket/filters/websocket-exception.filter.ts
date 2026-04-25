import { type ArgumentsHost, Catch } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import type { WebSocketMessage } from '../../interfaces/websocket.interface';

/**
 * WebSocket Exception Filter
 * Handles errors that occur in WebSocket handlers (logs suppressed)
 */
@Catch()
export class WebSocketExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const client: Socket = host.switchToWs().getClient();
    const error = this.extractError(exception);

    const errorResponse: WebSocketMessage = {
      type: 'error',
      error: {
        code: 'SERVER_ERROR',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.details : undefined,
      },
      timestamp: Date.now(),
    };

    client.emit('error', errorResponse);
  }

  private extractError(exception: unknown): { message: string; details?: Record<string, unknown> } {
    if (this.hasGetError(exception)) {
      return this.extractError(exception.getError());
    }

    if (exception instanceof Error) {
      return {
        message: exception.message || 'An unknown error occurred',
        details: { name: exception.name, stack: exception.stack },
      };
    }

    if (typeof exception === 'string') {
      return { message: exception };
    }

    if (typeof exception === 'object' && exception !== null) {
      const maybeMessage = 'message' in exception ? exception.message : undefined;
      return {
        message: typeof maybeMessage === 'string' && maybeMessage.length > 0 ? maybeMessage : 'An unknown error occurred',
        details: exception as Record<string, unknown>,
      };
    }

    return { message: 'An unknown error occurred' };
  }

  private hasGetError(exception: unknown): exception is { getError: () => unknown } {
    return typeof exception === 'object' && exception !== null && 'getError' in exception && typeof (exception as { getError?: unknown }).getError === 'function';
  }
}
