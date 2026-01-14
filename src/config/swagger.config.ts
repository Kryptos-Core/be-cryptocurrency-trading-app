import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

/**
 * Swagger Configuration
 * Setup API documentation with authentication
 */
export const setupSwagger = (app: INestApplication): void => {
  const config = new DocumentBuilder()
    .setTitle('Cryptocurrency Trading API')
    .setDescription(
      'API documentation for Cryptocurrency Trading Platform. ' +
        'This API provides endpoints for trading, wallet management, market data, and more.',
    )
    .setVersion('1.0')
    .setContact(
      'Development Team',
      'https://gitlab.duthu.net/cryptocurrency-trading-app',
      'support@example.com',
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth', // This name here is important for matching up with @ApiBearerAuth() in your controller!
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management endpoints')
    .addTag('wallets', 'Wallet management endpoints')
    .addTag('currencies', 'Currency management endpoints')
    .addTag('markets', 'Market data endpoints')
    .addTag('orders', 'Order management endpoints')
    .addTag('trades', 'Trade history endpoints')
    .addTag('price-alerts', 'Price alert endpoints')
    .addTag('deposits', 'Deposit endpoints')
    .addTag('withdrawals', 'Withdrawal endpoints')
    .addServer('http://localhost:3000', 'Development server')
    .addServer('https://api.example.com', 'Production server')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true, // Deep scan routes for better documentation
  });

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Keep auth token after page refresh
      tagsSorter: 'alpha', // Sort tags alphabetically
      operationsSorter: 'alpha', // Sort operations alphabetically
      docExpansion: 'list', // Expand tags by default
      filter: true, // Enable filter box
      showRequestDuration: true, // Show request duration
    },
    customSiteTitle: 'Crypto Trading API Docs',
  });
};

/**
 * Get Swagger JSON endpoint
 */
export const getSwaggerDocument = (app: INestApplication) => {
  const config = new DocumentBuilder()
    .setTitle('Cryptocurrency Trading API')
    .setDescription('API documentation for Cryptocurrency Trading Platform')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  return SwaggerModule.createDocument(app, config);
};
