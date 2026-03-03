import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { ResponseInterceptor, LoggingInterceptor } from './common/interceptors';
import { setupSwagger } from './config/swagger.config';

const logger = new Logger('Bootstrap');

function setupProcessErrorHandlers(): void {
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
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

  // Set global prefix for all routes
  app.setGlobalPrefix('api/v1');

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
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());

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
