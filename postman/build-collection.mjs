/**
 * Regenerates Cryptocurrency-Trading-API.postman_collection.json from the live template
 * plus all NestJS modules (sample URLs — adjust bodies per Swagger).
 * Run: node postman/build-collection.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'Cryptocurrency-Trading-API.postman_collection.json');

const bearer = {
  type: 'bearer',
  bearer: [{ key: 'token', value: '{{access_token}}', type: 'string' }],
};

/** @param {string[]} pathArr path segments after host (e.g. api, v1, health) */
function makeUrl(pathArr, query, variables) {
  const rawBase = `{{base_url}}/${pathArr.join('/')}`;
  const raw =
    query && query.length
      ? `${rawBase}?${query.map((q) => `${q.key}=${String(q.value)}`).join('&')}`
      : rawBase;
  const u = { raw, host: ['{{base_url}}'], path: pathArr };
  if (query?.length) u.query = query;
  if (variables?.length) u.variable = variables;
  return u;
}

function R(name, method, pathArr, opts = {}) {
  const { body, description, noAuth, headers = [] } = opts;
  const request = {
    method,
    header: [...headers],
    url: makeUrl(pathArr, opts.query, opts.variables),
    description: description ?? '',
  };
  if (!noAuth) request.auth = { ...bearer };
  if (body !== undefined) {
    request.body = { mode: 'raw', raw: body };
    if (!request.header.some((h) => h.key === 'Content-Type')) {
      request.header.push({ key: 'Content-Type', value: 'application/json' });
    }
  }
  return { name, request, response: [] };
}

function folder(name, items, description) {
  const f = { name, item: items };
  if (description) f.description = description;
  return f;
}

const loginWithTest = {
  name: 'Login',
  event: [
    {
      listen: 'test',
      script: {
        exec: [
          'if (pm.response.code === 200) {',
          '    const response = pm.response.json();',
          '    if (response.success && response.data && response.data.access_token) {',
          "        pm.environment.set('access_token', response.data.access_token);",
          "        console.log('Access token saved to environment');",
          '    }',
          '}',
        ],
        type: 'text/javascript',
      },
    },
  ],
  request: {
    method: 'POST',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: {
      mode: 'raw',
      raw: '{\n  "email": "user@example.com",\n  "password": "password123"\n}',
    },
    url: makeUrl(['api', 'v1', 'auth', 'login']),
    description: 'JWT login; saves `access_token` to environment when response matches API shape.',
  },
  response: [],
};

const health = folder('Health', [
  R('Health check', 'GET', ['api', 'v1', 'health'], {
    noAuth: true,
    description: 'Liveness/readiness style endpoint.',
  }),
]);

const auth = folder(
  'Auth',
  [
    loginWithTest,
    R('Register', 'POST', ['api', 'v1', 'auth', 'register'], {
      body: '{\n  "email": "newuser@example.com",\n  "password": "SecurePass1!",\n  "fullName": "New User"\n}',
      description: 'Đăng ký — chỉnh body theo DTO thực tế / Swagger.',
    }),
    R('Wallet nonce', 'POST', ['api', 'v1', 'auth', 'wallet-nonce'], {
      body: '{\n  "walletAddress": "0x0000000000000000000000000000000000000000",\n  "chain": "ETH_SEPOLIA"\n}',
    }),
    R('Wallet verify', 'POST', ['api', 'v1', 'auth', 'wallet-verify'], {
      body: '{\n  "walletAddress": "0x0000000000000000000000000000000000000000",\n  "signature": "",\n  "message": ""\n}',
    }),
    R('WalletConnect init (auth module)', 'POST', ['api', 'v1', 'auth', 'wallet', 'wc', 'init'], {
      body: '{}',
    }),
    R('WalletConnect status', 'GET', ['api', 'v1', 'auth', 'wallet', 'wc', 'status', ':sessionId'], {
      variables: [{ key: 'sessionId', value: 'session-id' }],
    }),
    R('WalletConnect verify', 'POST', ['api', 'v1', 'auth', 'wallet', 'wc', 'verify'], { body: '{}' }),
    R('2FA send OTP', 'POST', ['api', 'v1', 'auth', '2fa', 'send-otp'], { body: '{}' }),
    R('2FA validate OTP', 'POST', ['api', 'v1', 'auth', '2fa', 'validate-otp'], {
      body: '{\n  "code": "000000"\n}',
    }),
    R('2FA enable', 'POST', ['api', 'v1', 'auth', '2fa', 'enable'], { body: '{}' }),
    R('2FA disable', 'POST', ['api', 'v1', 'auth', '2fa', 'disable'], { body: '{}' }),
    R('Change password', 'POST', ['api', 'v1', 'auth', 'change-password'], {
      body: '{\n  "currentPassword": "old",\n  "newPassword": "newSecure1!"\n}',
    }),
    R('Me (auth)', 'GET', ['api', 'v1', 'auth', 'me']),
  ],
  'Authentication & session',
);

const metadata = folder(
  'Metadata',
  [
    R('Admin enums', 'GET', ['api', 'v1', 'enums'], {
      description: 'Ops roles only — JWT required. Reference values for admin UIs.',
    }),
  ],
  'GET /api/v1/enums (MetadataController)',
);

const dashboard = folder('Dashboard', [R('Dashboard summary', 'GET', ['api', 'v1', 'dashboard'])], 'Admin/ops dashboard');

const systemConfig = folder(
  'System configs',
  [
    R('List configs', 'GET', ['api', 'v1', 'system-configs']),
    R('Runtime flags', 'GET', ['api', 'v1', 'system-configs', 'runtime']),
    R('Patch runtime', 'PATCH', ['api', 'v1', 'system-configs', 'runtime'], {
      body: '{\n  "key": "example",\n  "value": "true"\n}',
    }),
    R('Patch by key', 'PATCH', ['api', 'v1', 'system-configs', ':key'], {
      variables: [{ key: 'key', value: 'feature_flag' }],
      body: '{\n  "value": "1"\n}',
    }),
  ],
  'system-configs module',
);

const paymentConfig = folder(
  'Payment configs',
  [
    R('List', 'GET', ['api', 'v1', 'payment-configs']),
    R('Options', 'GET', ['api', 'v1', 'payment-configs', 'options']),
    R('Get by id', 'GET', ['api', 'v1', 'payment-configs', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('Create', 'POST', ['api', 'v1', 'payment-configs'], { body: '{}' }),
    R('Update', 'PUT', ['api', 'v1', 'payment-configs', ':id'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Activate', 'POST', ['api', 'v1', 'payment-configs', ':id', 'activate'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Delete', 'DELETE', ['api', 'v1', 'payment-configs', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
  ],
  'payment-configs module',
);

const users = folder(
  'Users',
  [
    R('List users', 'GET', ['api', 'v1', 'users'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
    }),
    R('Statistics', 'GET', ['api', 'v1', 'users', 'statistics']),
    R('Me (users)', 'GET', ['api', 'v1', 'users', 'me']),
    R('Patch me', 'PATCH', ['api', 'v1', 'users', 'me'], { body: '{}' }),
    R('Patch profile basic', 'PATCH', ['api', 'v1', 'users', 'me', 'profile-basic'], { body: '{}' }),
    R('Contact email send OTP', 'POST', ['api', 'v1', 'users', 'me', 'contact-email', 'send-otp'], {
      body: '{}',
    }),
    R('Contact email verify', 'POST', ['api', 'v1', 'users', 'me', 'contact-email', 'verify'], {
      body: '{\n  "code": "000000"\n}',
    }),
    R('Security change request', 'POST', ['api', 'v1', 'users', 'me', 'security-change-requests'], {
      body: '{}',
    }),
    R('Upload avatar', 'POST', ['api', 'v1', 'users', 'me', 'avatar'], {
      body: '{}',
      description: 'Multipart nếu API yêu cầu — chỉnh trong Postman (form-data).',
    }),
    R('FCM token', 'PATCH', ['api', 'v1', 'users', 'me', 'fcm-token'], {
      body: '{\n  "token": "device-token"\n}',
    }),
    R('Pending security requests', 'GET', ['api', 'v1', 'users', 'security-change-requests', 'pending']),
    R('Approve security request', 'POST', [
      'api',
      'v1',
      'users',
      'security-change-requests',
      ':id',
      'approve',
    ], { variables: [{ key: 'id', value: '1' }], body: '{}' }),
    R('Reject security request', 'POST', [
      'api',
      'v1',
      'users',
      'security-change-requests',
      ':id',
      'reject',
    ], { variables: [{ key: 'id', value: '1' }], body: '{}' }),
    R('User by id', 'GET', ['api', 'v1', 'users', ':id'], { variables: [{ key: 'id', value: '1' }] }),
    R('Patch user', 'PATCH', ['api', 'v1', 'users', ':id'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Delete user', 'DELETE', ['api', 'v1', 'users', ':id'], { variables: [{ key: 'id', value: '1' }] }),
    R('User wallets', 'GET', ['api', 'v1', 'users', ':id', 'wallets'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('User on-chain txs', 'GET', ['api', 'v1', 'users', ':id', 'onchain-transactions'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('User security changes', 'GET', ['api', 'v1', 'users', ':id', 'security-changes'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('User orders', 'GET', ['api', 'v1', 'users', ':id', 'orders'], {
      variables: [{ key: 'id', value: '1' }],
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
    }),
  ],
  'users module — roles theo guard trên từng route',
);

const wallets = folder(
  'Wallets',
  [
    R('List / summary', 'GET', ['api', 'v1', 'wallets']),
    R('Balance', 'GET', ['api', 'v1', 'wallets', 'balance'], {
      query: [{ key: 'currencyId', value: '1' }],
    }),
    R('Ledger', 'GET', ['api', 'v1', 'wallets', 'ledger'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
      ],
    }),
    R('Sync', 'POST', ['api', 'v1', 'wallets', 'sync'], { body: '{}' }),
    R('Exchange balance', 'GET', ['api', 'v1', 'wallets', 'exchange-balance']),
    R('Reconciliation status', 'GET', ['api', 'v1', 'wallets', 'reconciliation-status']),
    R('Export reconciliation report', 'POST', ['api', 'v1', 'wallets', 'reconciliation-report', 'export'], {
      body: '{}',
    }),
    R('Admin adjust', 'POST', ['api', 'v1', 'wallets', 'admin', 'adjust'], { body: '{}' }),
    R('Admin adjustments by user', 'GET', ['api', 'v1', 'wallets', 'admin', 'adjustments', ':userId'], {
      variables: [{ key: 'userId', value: '1' }],
    }),
  ],
  'wallets module',
);

const blockchain = folder(
  'Blockchain',
  [
    R('Request link wallet', 'POST', ['api', 'v1', 'blockchain', 'wallets', 'request-link'], {
      body: '{}',
    }),
    R('Verify link', 'POST', ['api', 'v1', 'blockchain', 'wallets', 'verify-link'], { body: '{}' }),
    R('Linked wallets', 'GET', ['api', 'v1', 'blockchain', 'wallets']),
    R('Linked wallet balance', 'GET', ['api', 'v1', 'blockchain', 'wallets', ':linkId', 'balance'], {
      variables: [{ key: 'linkId', value: '1' }],
    }),
    R('Unlink wallet', 'DELETE', ['api', 'v1', 'blockchain', 'wallets', ':linkId'], {
      variables: [{ key: 'linkId', value: '1' }],
    }),
    R('Deposit address', 'GET', ['api', 'v1', 'blockchain', 'deposit', 'address'], {
      query: [{ key: 'chain', value: 'ETH_SEPOLIA' }],
    }),
    R('Deposit preview', 'GET', ['api', 'v1', 'blockchain', 'deposit', 'preview']),
    R('Deposit submit', 'POST', ['api', 'v1', 'blockchain', 'deposit', 'submit'], { body: '{}' }),
    R('Deposit settle', 'POST', ['api', 'v1', 'blockchain', 'deposit', ':txId', 'settle'], {
      variables: [{ key: 'txId', value: 'tx-id' }],
      body: '{}',
    }),
    R('Withdraw request', 'POST', ['api', 'v1', 'blockchain', 'withdraw', 'request'], { body: '{}' }),
    R('Withdraw manual approve', 'POST', ['api', 'v1', 'blockchain', 'withdraw', 'manual', ':txId', 'approve'], {
      variables: [{ key: 'txId', value: 'tx-id' }],
      body: '{}',
    }),
    R('Withdraw manual reject', 'POST', ['api', 'v1', 'blockchain', 'withdraw', 'manual', ':txId', 'reject'], {
      variables: [{ key: 'txId', value: 'tx-id' }],
      body: '{}',
    }),
    R('Withdraw process pending', 'POST', ['api', 'v1', 'blockchain', 'withdraw', 'manual', 'process-pending'], {
      body: '{}',
    }),
    R('Transactions', 'GET', ['api', 'v1', 'blockchain', 'transactions']),
    R('Transaction by id', 'GET', ['api', 'v1', 'blockchain', 'transactions', ':txId'], {
      variables: [{ key: 'txId', value: 'tx-id' }],
    }),
    R('Admin withdrawals stats', 'GET', ['api', 'v1', 'blockchain', 'admin', 'withdrawals', 'stats']),
    R('Admin withdrawal by id', 'GET', ['api', 'v1', 'blockchain', 'admin', 'withdrawals', ':txId'], {
      variables: [{ key: 'txId', value: 'tx-id' }],
    }),
    R('Admin withdrawals list', 'GET', ['api', 'v1', 'blockchain', 'admin', 'withdrawals']),
    R('Networks', 'GET', ['api', 'v1', 'blockchain', 'networks']),
  ],
  'On-chain wallet / deposit / withdraw',
);

const wc = folder(
  'Blockchain — WalletConnect (wc)',
  [
    R('WC init', 'POST', ['api', 'v1', 'blockchain', 'wallets', 'wc', 'init'], { body: '{}' }),
    R('WC status', 'GET', ['api', 'v1', 'blockchain', 'wallets', 'wc', 'status', ':sessionId'], {
      variables: [{ key: 'sessionId', value: 'session-id' }],
    }),
    R('WC submit', 'POST', ['api', 'v1', 'blockchain', 'wallets', 'wc', 'submit'], { body: '{}' }),
    R('WC relay webhook', 'POST', ['api', 'v1', 'blockchain', 'wallets', 'wc', 'relay-webhook'], {
      body: '{}',
      noAuth: true,
      description: 'Webhook từ relay — không Bearer user.',
    }),
  ],
  'wallet-connect.controller',
);

const managed = folder(
  'Managed wallets',
  [
    R('Create', 'POST', ['api', 'v1', 'managed-wallets'], { body: '{}' }),
    R('List', 'GET', ['api', 'v1', 'managed-wallets']),
    R('Deposit defaults', 'GET', ['api', 'v1', 'managed-wallets', 'deposit-defaults']),
    R('Patch recommended chain', 'PATCH', ['api', 'v1', 'managed-wallets', 'settings', 'recommended-chain'], {
      body: '{}',
    }),
    R('Get by id', 'GET', ['api', 'v1', 'managed-wallets', ':walletId'], {
      variables: [{ key: 'walletId', value: '1' }],
    }),
    R('Transactions', 'GET', ['api', 'v1', 'managed-wallets', ':walletId', 'transactions'], {
      variables: [{ key: 'walletId', value: '1' }],
    }),
    R('Send', 'POST', ['api', 'v1', 'managed-wallets', ':walletId', 'send'], {
      variables: [{ key: 'walletId', value: '1' }],
      body: '{}',
    }),
    R('Set deposit default', 'PATCH', ['api', 'v1', 'managed-wallets', ':walletId', 'set-deposit-default'], {
      variables: [{ key: 'walletId', value: '1' }],
      body: '{}',
    }),
    R('Clear deposit default', 'PATCH', ['api', 'v1', 'managed-wallets', ':walletId', 'clear-deposit-default'], {
      variables: [{ key: 'walletId', value: '1' }],
      body: '{}',
    }),
    R('Delete', 'DELETE', ['api', 'v1', 'managed-wallets', ':walletId'], {
      variables: [{ key: 'walletId', value: '1' }],
    }),
  ],
  'Custodial / managed wallet API',
);

const depositMethods = folder(
  'Deposit — methods',
  [R('List methods', 'GET', ['api', 'v1', 'deposit', 'methods'])],
  'deposit-methods.controller',
);

const deposits = folder(
  'Deposits (fiat / PayOS)',
  [
    R('Create fiat deposit', 'POST', ['api', 'v1', 'deposits'], { body: '{}' }),
    R('List my deposits', 'GET', ['api', 'v1', 'deposits']),
    R('Checkout meta', 'GET', ['api', 'v1', 'deposits', 'checkout-meta']),
    R('Sync status by order code', 'GET', ['api', 'v1', 'deposits', ':orderCode', 'sync-status'], {
      variables: [{ key: 'orderCode', value: 'ORDER_CODE' }],
    }),
    R('Admin all', 'GET', ['api', 'v1', 'deposits', 'admin', 'all']),
    R('PayOS webhook', 'POST', ['api', 'v1', 'deposits', 'payos-webhook'], {
      body: '{}',
      noAuth: true,
      description: 'Server-to-server — signature headers theo PayOS (không JWT).',
    }),
  ],
  'deposits.controller',
);

const payosRedirect = folder(
  'PayOS redirect (no /api/v1)',
  [
    {
      name: 'Success redirect',
      request: {
        method: 'GET',
        header: [],
        url: makeUrl(['success']),
        description: 'Excluded from global prefix in main.ts — browser redirect.',
      },
      response: [],
    },
    {
      name: 'Cancel redirect',
      request: {
        method: 'GET',
        header: [],
        url: makeUrl(['cancel']),
        description: 'Excluded from global prefix in main.ts.',
      },
      response: [],
    },
  ],
  'GET /success và /cancel (PayOS redirect)',
);

const exchange = folder(
  'Exchange',
  [R('Sync info', 'POST', ['api', 'v1', 'exchange', 'sync-info'], { body: '{}' })],
  'CEX sync',
);

const notifications = folder(
  'Notifications',
  [
    R('Create', 'POST', ['api', 'v1', 'notifications'], { body: '{}' }),
    R('List', 'GET', ['api', 'v1', 'notifications']),
    R('Unread count', 'GET', ['api', 'v1', 'notifications', 'unread-count']),
    R('Read all', 'PATCH', ['api', 'v1', 'notifications', 'read-all'], { body: '{}' }),
    R('Mark read', 'PATCH', ['api', 'v1', 'notifications', ':id', 'read'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
  ],
  'notifications module',
);

const treasury = folder(
  'Treasury',
  [
    R('Chain picker options', 'GET', ['api', 'v1', 'treasury', 'chain-picker-options']),
    R('List tx wallets', 'GET', ['api', 'v1', 'treasury', 'wallets']),
    R('Create tx wallet', 'POST', ['api', 'v1', 'treasury', 'wallets'], { body: '{}' }),
    R('Tx wallet by id', 'GET', ['api', 'v1', 'treasury', 'wallets', ':walletId'], {
      variables: [{ key: 'walletId', value: '1' }],
    }),
    R('Sweep', 'POST', ['api', 'v1', 'treasury', 'wallets', ':walletId', 'sweep'], {
      variables: [{ key: 'walletId', value: '1' }],
      body: '{}',
    }),
    R('Fund', 'POST', ['api', 'v1', 'treasury', 'wallets', ':walletId', 'fund'], {
      variables: [{ key: 'walletId', value: '1' }],
      body: '{}',
    }),
    R('Delete tx wallet', 'DELETE', ['api', 'v1', 'treasury', 'wallets', ':walletId'], {
      variables: [{ key: 'walletId', value: '1' }],
    }),
    R('Main wallets', 'GET', ['api', 'v1', 'treasury', 'main-wallets']),
    R('Main wallets pending', 'GET', ['api', 'v1', 'treasury', 'main-wallets', 'pending']),
    R('Create main wallet', 'POST', ['api', 'v1', 'treasury', 'main-wallets'], { body: '{}' }),
    R('Approve main wallet', 'PATCH', ['api', 'v1', 'treasury', 'main-wallets', ':mainWalletId', 'approve'], {
      variables: [{ key: 'mainWalletId', value: '1' }],
      body: '{}',
    }),
    R('Reject main wallet', 'PATCH', ['api', 'v1', 'treasury', 'main-wallets', ':mainWalletId', 'reject'], {
      variables: [{ key: 'mainWalletId', value: '1' }],
      body: '{}',
    }),
    R('Set default main wallet', 'PATCH', [
      'api',
      'v1',
      'treasury',
      'main-wallets',
      ':mainWalletId',
      'set-default',
    ], { variables: [{ key: 'mainWalletId', value: '1' }], body: '{}' }),
    R('Reveal private key', 'POST', [
      'api',
      'v1',
      'treasury',
      'main-wallets',
      ':mainWalletId',
      'reveal-private-key',
    ], { variables: [{ key: 'mainWalletId', value: '1' }], body: '{}' }),
    R('Patch main wallet', 'PATCH', ['api', 'v1', 'treasury', 'main-wallets', ':mainWalletId'], {
      variables: [{ key: 'mainWalletId', value: '1' }],
      body: '{}',
    }),
    R('Request deletion', 'PATCH', [
      'api',
      'v1',
      'treasury',
      'main-wallets',
      ':mainWalletId',
      'request-deletion',
    ], { variables: [{ key: 'mainWalletId', value: '1' }], body: '{}' }),
    R('Approve deletion', 'PATCH', [
      'api',
      'v1',
      'treasury',
      'main-wallets',
      ':mainWalletId',
      'approve-deletion',
    ], { variables: [{ key: 'mainWalletId', value: '1' }], body: '{}' }),
    R('Reject deletion', 'PATCH', [
      'api',
      'v1',
      'treasury',
      'main-wallets',
      ':mainWalletId',
      'reject-deletion',
    ], { variables: [{ key: 'mainWalletId', value: '1' }], body: '{}' }),
    R('Operations', 'GET', ['api', 'v1', 'treasury', 'operations']),
    R('Operation by id', 'GET', ['api', 'v1', 'treasury', 'operations', ':operationId'], {
      variables: [{ key: 'operationId', value: '1' }],
    }),
    R('Transactions', 'GET', ['api', 'v1', 'treasury', 'transactions']),
  ],
  'treasury module',
);

const marketMaker = folder(
  'Market maker',
  [
    R('Defaults', 'GET', ['api', 'v1', 'market-maker', 'defaults']),
    R('Config (all)', 'GET', ['api', 'v1', 'market-maker', 'config']),
    R('Config by pair', 'GET', ['api', 'v1', 'market-maker', 'config', ':pairId'], {
      variables: [{ key: 'pairId', value: '1' }],
    }),
    R('Put config', 'PUT', ['api', 'v1', 'market-maker', 'config', ':pairId'], {
      variables: [{ key: 'pairId', value: '1' }],
      body: '{}',
    }),
    R('Delete config', 'DELETE', ['api', 'v1', 'market-maker', 'config', ':pairId'], {
      variables: [{ key: 'pairId', value: '1' }],
    }),
    R('Place', 'POST', ['api', 'v1', 'market-maker', 'place', ':pairId'], {
      variables: [{ key: 'pairId', value: '1' }],
      body: '{}',
    }),
    R('Refresh', 'POST', ['api', 'v1', 'market-maker', 'refresh', ':pairId'], {
      variables: [{ key: 'pairId', value: '1' }],
      body: '{}',
    }),
    R('Dashboard', 'GET', ['api', 'v1', 'market-maker', 'dashboard']),
  ],
  'market-maker module',
);

// --- Load preserved folders from previous collection (Currencies, Markets, Orders) ---
let preserved = { Currencies: [], Markets: [], Orders: [] };
try {
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  for (const f of prev.item || []) {
    if (preserved[f.name] !== undefined) {
      preserved[f.name] = f.item;
    }
  }
} catch {
  /* first run */
}

function addMarketDepthOhlcv(items) {
  const extra = [
    R('Get depth by pair id', 'GET', ['api', 'v1', 'markets', ':id', 'depth'], {
      variables: [{ key: 'id', value: '1' }],
      query: [{ key: 'limit', value: '50' }],
    }),
    R('Get depth by symbol', 'GET', ['api', 'v1', 'markets', 'symbol', ':symbol', 'depth'], {
      variables: [{ key: 'symbol', value: 'BTC/USDT' }],
      query: [{ key: 'limit', value: '50' }],
    }),
    R('Get OHLCV by pair id', 'GET', ['api', 'v1', 'markets', ':id', 'ohlcv'], {
      variables: [{ key: 'id', value: '1' }],
      query: [
        { key: 'interval', value: '1h' },
        { key: 'limit', value: '100' },
      ],
      description: 'Query params theo Swagger (interval, from, to, …).',
    }),
  ];
  return [...items, ...extra];
}

function patchOrdersFolder(items) {
  const mapped = items.map((it) => {
    if (it.name === 'Get Order by ID') {
      return R('Get Order by ID', 'GET', ['api', 'v1', 'orders', ':orderId'], {
        variables: [{ key: 'orderId', value: '1' }],
        description: it.request?.description,
      });
    }
    if (it.name === 'Cancel Order') {
      return R('Cancel Order', 'POST', ['api', 'v1', 'orders', ':orderId', 'cancel'], {
        variables: [{ key: 'orderId', value: '1' }],
        body: '{}',
        description: it.request?.description,
      });
    }
    if (it.name === 'Get Order Book (Bids/Asks)') {
      return R('Get Order Book (Bids/Asks)', 'GET', ['api', 'v1', 'orders', 'book', ':pairId'], {
        variables: [{ key: 'pairId', value: '1' }],
        query: [
          { key: 'side', value: 'BUY' },
          { key: 'limit', value: '20' },
        ],
        description: it.request?.description,
      });
    }
    return it;
  });
  const more = [
    R('Create orders batch', 'POST', ['api', 'v1', 'orders', 'batch'], {
      body: '{\n  "orders": []\n}',
    }),
    R('Batch cancel', 'POST', ['api', 'v1', 'orders', 'batch-cancel'], { body: '{\n  "orderIds": []\n}' }),
    R('Admin all orders', 'GET', ['api', 'v1', 'orders', 'admin', 'all'], {
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '50' },
      ],
    }),
    R('Admin reconcile matching', 'POST', ['api', 'v1', 'orders', 'admin', 'reconcile-matching', ':pairId'], {
      variables: [{ key: 'pairId', value: '1' }],
      body: '{}',
    }),
  ];
  return [...mapped, ...more];
}

const currenciesFolder = folder(
  'Currencies',
  preserved.Currencies.length ? preserved.Currencies : [],
  'CRUD operations cho currencies module',
);
const marketsFolder = folder(
  'Markets',
  preserved.Markets.length ? addMarketDepthOhlcv(preserved.Markets) : addMarketDepthOhlcv([]),
  'CRUD operations và market data endpoints cho markets module',
);
const ordersFolder = folder(
  'Orders',
  preserved.Orders.length ? patchOrdersFolder(preserved.Orders) : [],
  'Orders: batch, admin reconcile, idempotency — chỉnh body theo DTO.',
);

const collection = {
  info: {
    _postman_id: 'cryptocurrency-trading-api',
    name: 'Cryptocurrency Trading API',
    description:
      'Collection đầy đủ theo module NestJS (`api/v1`).\n\n**Biến environment:** `base_url`, `access_token` (Login lưu token).\n\n**Regenerate:** `npm run postman:build` (chạy `postman/build-collection.mjs`).\n\nMột số body là placeholder — đối chiếu Swagger tại `/api/docs` (non-production).',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    health,
    auth,
    metadata,
    dashboard,
    systemConfig,
    paymentConfig,
    currenciesFolder,
    marketsFolder,
    ordersFolder,
    users,
    wallets,
    blockchain,
    wc,
    managed,
    depositMethods,
    deposits,
    payosRedirect,
    exchange,
    notifications,
    treasury,
    marketMaker,
  ],
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          "// Auto-set base_url if not exists",
          "if (!pm.environment.get('base_url')) {",
          "    pm.environment.set('base_url', 'http://localhost:3000');",
          '}',
        ],
      },
    },
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          "pm.test('Response time < 5000ms', function () {",
          '    pm.expect(pm.response.responseTime).to.be.below(5000);',
          '});',
        ],
      },
    },
  ],
  variable: [
    { key: 'base_url', value: 'http://localhost:3000', type: 'string' },
    { key: 'access_token', value: '', type: 'string' },
  ],
};

fs.writeFileSync(OUT, `${JSON.stringify(collection, null, '\t')}\n`);
console.log('Wrote', OUT);
