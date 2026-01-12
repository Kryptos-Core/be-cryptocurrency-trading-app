import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from '../exceptions';

/**
 * Global Exception Filter
 * Handle all exceptions using a consistent format
 * Application: Separation of Concerns
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: any = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: 'Internal server error',
    };

    if (exception instanceof AppException) {
      // Custom Application Exception
      status = exception.statusCode;
      body = {
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(exception.context && { context: exception.context }),
      };
    } else if (exception instanceof HttpException) {
      // NestJS Built-in Exception
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      body = {
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(typeof exceptionResponse === 'object' ? exceptionResponse : { message: exceptionResponse }),
      };
    } else if (exception instanceof Error) {
      // Unhandled Error
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(process.env.NODE_ENV === 'development' && { error: exception.message }),
      };
    }

    response.status(status).json(body);
  }
}
