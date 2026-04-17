import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import {
  LoggingInterceptor,
  ResponseInterceptor,
  TelemetryContextInterceptor,
} from './common/interceptors';
import { setupSwagger } from './config/swagger.config';

const logger = new Logger('Bootstrap');

/** Relay/SDK có thể gửi sự kiện trễ sau disconnect — SignClient ném lỗi này ngoài promise của app. */
function isBenignWalletConnectRelayRejection(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const m = msg.toLowerCase();
  return (
    (m.includes('no matching key') && m.includes('session topic')) ||
    m.includes("session topic doesn't exist")
  );
}

function setupProcessErrorHandlers(): void {
  process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
    if (isBenignWalletConnectRelayRejection(reason)) {
      logger.warn(
        'Unhandled Rejection (WalletConnect relay/SDK — process continues; see docs/WALLETCONNECT.md)',
        reason instanceof Error ? reason.message : String(reason),
      );
      return;
    }
    logger.error('Unhandled Rejection', reason instanceof Error ? reason.stack : String(reason));
    process.exit(1);
  });

  process.on('uncaughtException', (err: Error) => {
    logger.error('Uncaught Exception', err.stack ?? err.message);
    process.exit(1);
  });
}

async function bootstrap() {
  setupProcessErrorHandlers();

  const app = await NestFactory.create(AppModule);

  // Enable WebSocket with Socket.io
  app.useWebSocketAdapter(new IoAdapter(app));

  // Set global prefix for all routes (exclude PayOS redirect pages)
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'success', method: RequestMethod.GET },
      { path: 'cancel', method: RequestMethod.GET },
    ],
  });

  // Enable CORS
  app.enableCors();

  // Global Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Filters
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global Interceptors
  app.useGlobalInterceptors(
    new TelemetryContextInterceptor(),
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );

  // Setup Swagger Documentation
  if (process.env.NODE_ENV !== 'production') {
    setupSwagger(app);
    logger.log('📚 Swagger documentation available at http://localhost:3000/api/docs');
  }

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  const base = `http://127.0.0.1:${port}`;
  logger.log(`🚀 Server running on ${base} (API: ${base}/api/v1, health: ${base}/api/v1/health)`);
}

bootstrap();
