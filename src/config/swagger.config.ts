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
    customCss: `
      /* Modern Swagger UI Styling */
      .swagger-ui .topbar {
        display: none;
      }

      /* Modern Info Section */
      .swagger-ui .info {
        margin: 0 0 30px 0;
        padding: 30px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        color: white;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      }

      .swagger-ui .info .title {
        color: white;
        font-size: 36px;
        font-weight: 700;
        margin-bottom: 10px;
      }

      .swagger-ui .info .title small {
        background: rgba(255, 255, 255, 0.25);
        color: white;
        padding: 6px 14px;
        border-radius: 8px;
        font-weight: 600;
        margin-left: 12px;
        font-size: 14px;
      }

      .swagger-ui .info p {
        color: rgba(255, 255, 255, 0.95);
        font-size: 16px;
        line-height: 1.7;
        margin: 15px 0;
      }

      .swagger-ui .info a {
        color: white;
        text-decoration: underline;
        opacity: 0.9;
        transition: opacity 0.2s;
      }

      .swagger-ui .info a:hover {
        opacity: 1;
      }

      /* Modern Tag Cards */
      .swagger-ui .opblock-tag {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        margin: 15px 0;
        padding: 20px 24px;
        transition: all 0.3s ease;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
      }

      .swagger-ui .opblock-tag:hover {
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
        border-color: #667eea;
      }

      .swagger-ui .opblock-tag small {
        color: #6b7280;
        font-size: 14px;
        margin-top: 6px;
        display: block;
      }

      /* Modern Operation Blocks */
      .swagger-ui .opblock {
        border-radius: 10px;
        margin: 12px 0;
        border: 1px solid #e5e7eb;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        transition: all 0.3s ease;
        overflow: hidden;
      }

      .swagger-ui .opblock:hover {
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
        transform: translateY(-2px);
      }

      .swagger-ui .opblock.opblock-get {
        border-left: 4px solid #3b82f6;
      }

      .swagger-ui .opblock.opblock-get .opblock-summary {
        border-color: #3b82f6;
      }

      .swagger-ui .opblock.opblock-post {
        border-left: 4px solid #10b981;
      }

      .swagger-ui .opblock.opblock-post .opblock-summary {
        border-color: #10b981;
      }

      .swagger-ui .opblock.opblock-put,
      .swagger-ui .opblock.opblock-patch {
        border-left: 4px solid #f59e0b;
      }

      .swagger-ui .opblock.opblock-put .opblock-summary,
      .swagger-ui .opblock.opblock-patch .opblock-summary {
        border-color: #f59e0b;
      }

      .swagger-ui .opblock.opblock-delete {
        border-left: 4px solid #ef4444;
      }

      .swagger-ui .opblock.opblock-delete .opblock-summary {
        border-color: #ef4444;
      }

      /* Modern Buttons */
      .swagger-ui .btn {
        border-radius: 8px;
        padding: 10px 20px;
        font-weight: 600;
        transition: all 0.2s;
        border: none;
      }

      .swagger-ui .btn.authorize {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }

      .swagger-ui .btn.authorize:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
      }

      .swagger-ui .btn.execute {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
      }

      .swagger-ui .btn.execute:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }

      /* Modern Input Fields */
      .swagger-ui input[type="text"],
      .swagger-ui input[type="password"],
      .swagger-ui input[type="search"],
      .swagger-ui input[type="email"],
      .swagger-ui textarea,
      .swagger-ui select {
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        padding: 10px 14px;
        transition: all 0.2s;
        font-size: 14px;
      }

      .swagger-ui input[type="text"]:focus,
      .swagger-ui input[type="password"]:focus,
      .swagger-ui input[type="search"]:focus,
      .swagger-ui input[type="email"]:focus,
      .swagger-ui textarea:focus,
      .swagger-ui select:focus {
        border-color: #667eea;
        outline: none;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      /* Modern Response Section */
      .swagger-ui .response-col_status {
        font-weight: 600;
        font-size: 14px;
      }

      /* Modern Schema Section */
      .swagger-ui .model-box {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 20px;
        margin: 15px 0;
      }

      /* Filter Input */
      .swagger-ui .filter-container input {
        border-radius: 10px;
        padding: 12px 18px;
        font-size: 15px;
        border: 2px solid #e5e7eb;
      }

      .swagger-ui .filter-container input:focus {
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      /* Server Selection */
      .swagger-ui .scheme-container {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 20px;
        margin: 25px 0;
      }

      /* Code Blocks */
      .swagger-ui .highlight-code {
        border-radius: 8px;
        overflow: hidden;
        background: #1e1e1e;
      }

      /* Response Examples */
      .swagger-ui .response-content-type {
        font-weight: 600;
      }

      /* Responsive */
      @media (max-width: 768px) {
        .swagger-ui .info {
          padding: 20px;
        }

        .swagger-ui .info .title {
          font-size: 28px;
        }

        .swagger-ui .opblock-tag {
          padding: 16px 20px;
        }
      }

      /* Smooth Scrollbar */
      ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }

      ::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 5px;
      }

      ::-webkit-scrollbar-thumb {
        background: #c1c1c1;
        border-radius: 5px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: #a8a8a8;
      }

      /* Loading Animation */
      .swagger-ui .loading-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 40px;
      }
    `,
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
