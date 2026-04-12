import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const SWAGGER_CUSTOM_CSS_PATHS = [
  join(__dirname, 'swagger-custom.css'),
  join(process.cwd(), 'dist/config/swagger-custom.css'),
  join(process.cwd(), 'src/config/swagger-custom.css'),
] as const;

let hasWarnedMissingSwaggerCss = false;

const loadSwaggerCustomCss = (): string => {
  for (const cssPath of SWAGGER_CUSTOM_CSS_PATHS) {
    if (existsSync(cssPath)) {
      return readFileSync(cssPath, 'utf8');
    }
  }

  if (!hasWarnedMissingSwaggerCss) {
    process.emitWarning('Swagger custom CSS not found. Using default Swagger UI styling.', {
      code: 'SWAGGER_CSS_MISSING',
    });
    hasWarnedMissingSwaggerCss = true;
  }

  return '';
};

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
    .addTag('deposits', 'Deposit endpoints')
    .addTag('withdrawals', 'Withdrawal endpoints')
    .addServer('http://localhost:3000', 'Development server')
    .addServer('https://api.example.com', 'Production server')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true, // Deep scan routes for better documentation
  });

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Keep auth token after page refresh
      tagsSorter: 'alpha', // Sort tags alphabetically
      operationsSorter: 'alpha', // Sort operations alphabetically
      docExpansion: 'none', // Don't expand by default (cleaner look)
      filter: true, // Enable filter box
      showRequestDuration: true, // Show request duration
      deepLinking: true, // Enable deep linking for operations
      displayRequestDuration: true, // Show request duration
      tryItOutEnabled: true, // Enable "Try it out" by default
      requestSnippetsEnabled: true, // Show code snippets
      requestSnippets: {
        generators: {
          curl_bash: {
            title: 'cURL (bash)',
          },
          curl_powershell: {
            title: 'cURL (PowerShell)',
          },
          curl_cmd: {
            title: 'cURL (CMD)',
          },
        },
        defaultExpanded: true,
      },
      syntaxHighlight: {
        activate: true,
        theme: 'monokai', // Modern syntax highlighting theme
      },
      defaultModelsExpandDepth: 1, // Expand models by default
      defaultModelExpandDepth: 1, // Expand model properties
      displayOperationId: false, // Hide operation IDs (cleaner)
      showExtensions: true, // Show extensions
      showCommonExtensions: true, // Show common extensions
    },
    customSiteTitle: 'Crypto Trading API Docs',
    customCss: loadSwaggerCustomCss(),
  });
};
