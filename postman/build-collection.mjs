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

// ─── Auth ───────────────────────────────────────────────────────────────────────
const auth = folder(
  'Auth',
  [
    R('Register', 'POST', ['api', 'v1', 'auth', 'register'], {
      body: '{\n  "email": "user@example.com",\n  "password": "SecurePass1!",\n  "fullName": "New User"\n}',
      description: 'Đăng ký tài khoản mới.',
    }),
    R('Login', 'POST', ['api', 'v1', 'auth', 'login'], {
      body: '{\n  "email": "user@example.com",\n  "password": "password123"\n}',
      description: 'Đăng nhập — lưu access_token vào environment.',
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              'if (pm.response.code === 200) {',
              '    const response = pm.response.json();',
              '    if (response.data && response.data.access_token) {',
              "        pm.environment.set('access_token', response.data.access_token);",
              "        console.log('Access token saved');",
              '    }',
              '}',
            ],
            type: 'text/javascript',
          },
        },
      ],
    }),
    R('Wallet nonce', 'POST', ['api', 'v1', 'auth', 'wallet-nonce'], {
      body: '{\n  "walletAddress": "0x0000000000000000000000000000000000000000",\n  "chain": "ETH_SEPOLIA"\n}',
      description: 'Lấy nonce để sign message cho wallet auth.',
    }),
    R('Wallet verify', 'POST', ['api', 'v1', 'auth', 'wallet-verify'], {
      body: '{\n  "walletAddress": "0x0000000000000000000000000000000000000000",\n  "signature": "",\n  "message": ""\n}',
      description: 'Verify signature từ wallet.',
    }),
    R('WalletConnect init', 'POST', ['api', 'v1', 'auth', 'wallet', 'wc', 'init'], {
      body: '{}',
      description: 'Init WalletConnect session.',
    }),
    R('WalletConnect status', 'GET', ['api', 'v1', 'auth', 'wallet', 'wc', 'status', ':sessionId'], {
      variables: [{ key: 'sessionId', value: 'session-id' }],
    }),
    R('WalletConnect verify', 'POST', ['api', 'v1', 'auth', 'wallet', 'wc', 'verify'], {
      body: '{}',
    }),
    R('2FA send OTP', 'POST', ['api', 'v1', 'auth', '2fa', 'send-otp'], {
      body: '{}',
    }),
    R('2FA validate OTP', 'POST', ['api', 'v1', 'auth', '2fa', 'validate-otp'], {
      body: '{\n  "code": "000000"\n}',
    }),
    R('2FA enable', 'POST', ['api', 'v1', 'auth', '2fa', 'enable'], {
      body: '{}',
    }),
    R('2FA disable', 'POST', ['api', 'v1', 'auth', '2fa', 'disable'], {
      body: '{}',
    }),
    R('Change password', 'POST', ['api', 'v1', 'auth', 'change-password'], {
      body: '{\n  "currentPassword": "oldPassword",\n  "newPassword": "newSecure1!"\n}',
    }),
    R('Me', 'GET', ['api', 'v1', 'auth', 'me']),
  ],
  'Authentication & session',
);

// ─── Health ─────────────────────────────────────────────────────────────────────
const health = folder(
  'Health',
  [
    R('Health check', 'GET', ['api', 'v1', 'health'], { noAuth: true }),
    R('Ready check', 'GET', ['api', 'v1', 'health', 'ready'], { noAuth: true }),
  ],
  'Liveness/readiness',
);

// ─── Dashboard ─────────────────────────────────────────────────────────────────
const dashboard = folder('Dashboard', [R('Summary', 'GET', ['api', 'v1', 'dashboard'])], 'Admin/ops dashboard');

// ─── System Configs ─────────────────────────────────────────────────────────────
const systemConfig = folder(
  'System configs',
  [
    R('List all', 'GET', ['api', 'v1', 'system-configs']),
    R('Runtime all', 'GET', ['api', 'v1', 'system-configs', 'runtime']),
    R('Runtime tech', 'GET', ['api', 'v1', 'system-configs', 'runtime', 'tech']),
    R('Patch runtime tech', 'PATCH', ['api', 'v1', 'system-configs', 'runtime', 'tech'], {
      body: '{\n  "key": "DEPOSIT_WATCHER_ENABLED",\n  "value": "true"\n}',
    }),
    R('Runtime finance', 'GET', ['api', 'v1', 'system-configs', 'runtime', 'finance']),
    R('Patch runtime finance', 'PATCH', ['api', 'v1', 'system-configs', 'runtime', 'finance'], {
      body: '{\n  "key": "FEE_RATE",\n  "value": "0.001"\n}',
    }),
    R('Runtime ops', 'GET', ['api', 'v1', 'system-configs', 'runtime', 'ops']),
    R('Patch runtime ops', 'PATCH', ['api', 'v1', 'system-configs', 'runtime', 'ops'], {
      body: '{\n  "key": "TRON_GRID_API_KEY",\n  "value": "your-api-key"\n}',
    }),
    R('Runtime core', 'GET', ['api', 'v1', 'system-configs', 'runtime', 'core']),
    R('Patch runtime core', 'PATCH', ['api', 'v1', 'system-configs', 'runtime', 'core'], {
      body: '{\n  "key": "MARKET_SOURCE",\n  "value": "binance"\n}',
    }),
    R('Patch by key', 'PATCH', ['api', 'v1', 'system-configs', ':key'], {
      variables: [{ key: 'key', value: 'FEATURE_FLAG' }],
      body: '{\n  "value": "1"\n}',
    }),
  ],
  'System configuration',
);

// ─── Payment Configs ────────────────────────────────────────────────────────────
const paymentConfig = folder(
  'Payment configs',
  [
    R('List', 'GET', ['api', 'v1', 'payment-configs']),
    R('Options', 'GET', ['api', 'v1', 'payment-configs', 'options']),
    R('Get by id', 'GET', ['api', 'v1', 'payment-configs', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('Create', 'POST', ['api', 'v1', 'payment-configs'], {
      body: '{\n  "type": "TRON",\n  "network": "TRON_NILE",\n  "enabled": true\n}',
    }),
    R('Update', 'PUT', ['api', 'v1', 'payment-configs', ':id'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{\n  "enabled": true\n}',
    }),
    R('Activate', 'POST', ['api', 'v1', 'payment-configs', ':id', 'activate'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Delete', 'DELETE', ['api', 'v1', 'payment-configs', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
  ],
  'Payment gateway configuration',
);

// ─── Treasury E2E Config ───────────────────────────────────────────────────────
const treasuryE2E = folder(
  'Treasury E2E Config',
  [
    R('List', 'GET', ['api', 'v1', 'treasury-e2e-config']),
    R('Options', 'GET', ['api', 'v1', 'treasury-e2e-config', 'options']),
    R('Validate', 'POST', ['api', 'v1', 'treasury-e2e-config', 'validate'], {
      body: '{}',
    }),
    R('Test connection', 'POST', ['api', 'v1', 'treasury-e2e-config', 'test-connection'], {
      body: '{}',
    }),
    R('Get by id', 'GET', ['api', 'v1', 'treasury-e2e-config', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('Create', 'POST', ['api', 'v1', 'treasury-e2e-config'], {
      body: '{}',
    }),
    R('Update', 'PUT', ['api', 'v1', 'treasury-e2e-config', ':id'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Activate', 'POST', ['api', 'v1', 'treasury-e2e-config', ':id', 'activate'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Deactivate', 'POST', ['api', 'v1', 'treasury-e2e-config', ':id', 'deactivate'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Delete', 'DELETE', ['api', 'v1', 'treasury-e2e-config', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
  ],
  'Treasury E2E configuration',
);

// ─── Deposit Watcher (Admin) ────────────────────────────────────────────────────
const depositWatcher = folder(
  'Deposit Watcher (Admin)',
  [
    R('List cursors', 'GET', ['api', 'v1', 'admin', 'deposit-watcher', 'cursors']),
    R('Reset cursor', 'POST', ['api', 'v1', 'admin', 'deposit-watcher', 'reset-cursor'], {
      query: [{ key: 'chain', value: 'TRON_NILE' }],
      noAuth: true,
      description: 'Reset scan cursor for a chain. Query: chain=TRON_NILE',
    }),
    R('Reset all cursors', 'DELETE', ['api', 'v1', 'admin', 'deposit-watcher', 'cursors']),
    R('Refresh tx (webhook)', 'POST', ['api', 'v1', 'internal', 'deposit-watcher', 'refresh'], {
      body: '{\n  "chain": "TRON_NILE",\n  "txHash": "57d7141773986b7941e53f30311d455cb631aead463e6b17a16ffc6862a031a4"\n}',
      noAuth: true,
      description: 'Manual refresh a tx hash. Requires x-deposit-watcher-secret header.',
    }),
  ],
  'Deposit watcher management',
);

// ─── Currencies ────────────────────────────────────────────────────────────────
const currencies = folder(
  'Currencies',
  [
    R('List all', 'GET', ['api', 'v1', 'currencies']),
    R('Active', 'GET', ['api', 'v1', 'currencies', 'active']),
    R('Tradable', 'GET', ['api', 'v1', 'currencies', 'tradable']),
    R('Get by id', 'GET', ['api', 'v1', 'currencies', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('Get by symbol', 'GET', ['api', 'v1', 'currencies', 'symbol', ':symbol'], {
      variables: [{ key: 'symbol', value: 'USDT' }],
    }),
    R('Create', 'POST', ['api', 'v1', 'currencies'], {
      body: '{}',
    }),
    R('Update', 'PATCH', ['api', 'v1', 'currencies', ':id'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Delete', 'DELETE', ['api', 'v1', 'currencies', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
  ],
  'Currency management',
);

// ─── Markets ────────────────────────────────────────────────────────────────────
const markets = folder(
  'Markets',
  [
    R('List all', 'GET', ['api', 'v1', 'markets']),
    R('Active', 'GET', ['api', 'v1', 'markets', 'active'], {
      description: 'Must be before :id route',
    }),
    R('Tickers all', 'GET', ['api', 'v1', 'markets', 'tickers', 'all']),
    R('Get by symbol', 'GET', ['api', 'v1', 'markets', 'symbol', ':symbol'], {
      variables: [{ key: 'symbol', value: 'BTC/USDT' }],
      description: 'Must be before :id route',
    }),
    R('Ticker by symbol', 'GET', ['api', 'v1', 'markets', 'symbol', ':symbol', 'ticker'], {
      variables: [{ key: 'symbol', value: 'BTC/USDT' }],
    }),
    R('Orderbook by symbol', 'GET', ['api', 'v1', 'markets', 'symbol', ':symbol', 'orderbook'], {
      variables: [{ key: 'symbol', value: 'BTC/USDT' }],
    }),
    R('Trades by symbol', 'GET', ['api', 'v1', 'markets', 'symbol', ':symbol', 'trades'], {
      variables: [{ key: 'symbol', value: 'BTC/USDT' }],
    }),
    R('Depth by symbol', 'GET', ['api', 'v1', 'markets', 'symbol', ':symbol', 'depth'], {
      variables: [{ key: 'symbol', value: 'BTC/USDT' }],
      query: [{ key: 'limit', value: '50' }],
    }),
    R('Get by id', 'GET', ['api', 'v1', 'markets', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('Ticker by id', 'GET', ['api', 'v1', 'markets', ':id', 'ticker'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('Orderbook by id', 'GET', ['api', 'v1', 'markets', ':id', 'orderbook'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('OHLCV by id', 'GET', ['api', 'v1', 'markets', ':id', 'ohlcv'], {
      variables: [{ key: 'id', value: '1' }],
      query: [{ key: 'interval', value: '1h' }, { key: 'limit', value: '100' }],
    }),
    R('Trades by id', 'GET', ['api', 'v1', 'markets', ':id', 'trades'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('Depth by id', 'GET', ['api', 'v1', 'markets', ':id', 'depth'], {
      variables: [{ key: 'id', value: '1' }],
      query: [{ key: 'limit', value: '50' }],
    }),
    R('Create', 'POST', ['api', 'v1', 'markets'], { body: '{}' }),
    R('Update', 'PATCH', ['api', 'v1', 'markets', ':id'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Delete', 'DELETE', ['api', 'v1', 'markets', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('Admin reconciliation', 'GET', ['api', 'v1', 'markets', 'admin', 'read-model', 'reconciliation']),
    R('Collect reconciliation metrics', 'POST', ['api', 'v1', 'markets', 'admin', 'read-model', 'reconciliation', 'collect-metrics'], {
      body: '{}',
    }),
  ],
  'Market data & trading pairs',
);

// ─── Orders ────────────────────────────────────────────────────────────────────
const orders = folder(
  'Orders',
  [
    R('Create order', 'POST', ['api', 'v1', 'orders'], {
      body: '{\n  "pairId": 1,\n  "side": "BUY",\n  "type": "LIMIT",\n  "quantity": "0.01",\n  "price": "50000"\n}',
    }),
    R('Batch create', 'POST', ['api', 'v1', 'orders', 'batch'], {
      body: '{\n  "orders": []\n}',
    }),
    R('My orders', 'GET', ['api', 'v1', 'orders', 'my']),
    R('Get by id', 'GET', ['api', 'v1', 'orders', ':orderId'], {
      variables: [{ key: 'orderId', value: '1' }],
    }),
    R('Cancel', 'POST', ['api', 'v1', 'orders', ':orderId', 'cancel'], {
      variables: [{ key: 'orderId', value: '1' }],
      body: '{}',
    }),
    R('Batch cancel', 'POST', ['api', 'v1', 'orders', 'batch-cancel'], {
      body: '{\n  "orderIds": []\n}',
    }),
    R('Order book', 'GET', ['api', 'v1', 'orders', 'book', ':pairId'], {
      variables: [{ key: 'pairId', value: '1' }],
      query: [{ key: 'side', value: 'BUY' }, { key: 'limit', value: '20' }],
    }),
    R('Admin all', 'GET', ['api', 'v1', 'orders', 'admin', 'all'], {
      query: [{ key: 'page', value: '1' }, { key: 'limit', value: '50' }],
    }),
    R('Admin reconcile', 'POST', ['api', 'v1', 'orders', 'admin', 'reconcile-matching', ':pairId'], {
      variables: [{ key: 'pairId', value: '1' }],
      body: '{}',
    }),
    R('Shadow parity check', 'GET', ['api', 'v1', 'orders', 'admin', 'shadow-parity', ':pairId'], {
      variables: [{ key: 'pairId', value: '1' }],
    }),
  ],
  'Trading orders',
);

// ─── Trading Ops ────────────────────────────────────────────────────────────────
const tradingOps = folder(
  'Trading Ops',
  [
    R('Public WS parity', 'GET', ['api', 'v1', 'ops', 'trading', 'public-ws-parity']),
    R('Go rollout readiness', 'GET', ['api', 'v1', 'ops', 'trading', 'go-rollout-readiness']),
    R('Rollout snapshots', 'GET', ['api', 'v1', 'ops', 'trading', 'go-rollout-readiness', 'snapshots']),
    R('Latest snapshot', 'GET', ['api', 'v1', 'ops', 'trading', 'go-rollout-readiness', 'snapshots', 'latest']),
    R('Create snapshot', 'POST', ['api', 'v1', 'ops', 'trading', 'go-rollout-readiness', 'snapshot'], {
      body: '{}',
    }),
    R('Rollback drills', 'GET', ['api', 'v1', 'ops', 'trading', 'go-rollout-readiness', 'rollback-drills']),
    R('Latest rollback drill', 'GET', ['api', 'v1', 'ops', 'trading', 'go-rollout-readiness', 'rollback-drills', 'latest']),
    R('Run rollback drill', 'POST', ['api', 'v1', 'ops', 'trading', 'go-rollout-readiness', 'rollback-drills'], {
      body: '{}',
    }),
  ],
  'Trading operations & rollout',
);

// ─── Users ─────────────────────────────────────────────────────────────────────
const users = folder(
  'Users',
  [
    R('List', 'GET', ['api', 'v1', 'users'], {
      query: [{ key: 'page', value: '1' }, { key: 'limit', value: '20' }],
    }),
    R('Statistics', 'GET', ['api', 'v1', 'users', 'statistics']),
    R('Me', 'GET', ['api', 'v1', 'users', 'me']),
    R('Patch me', 'PATCH', ['api', 'v1', 'users', 'me'], { body: '{}' }),
    R('Patch profile basic', 'PATCH', ['api', 'v1', 'users', 'me', 'profile-basic'], {
      body: '{}',
    }),
    R('Send OTP (contact email)', 'POST', ['api', 'v1', 'users', 'me', 'contact-email', 'send-otp'], {
      body: '{}',
    }),
    R('Verify contact email', 'POST', ['api', 'v1', 'users', 'me', 'contact-email', 'verify'], {
      body: '{\n  "code": "000000"\n}',
    }),
    R('Security change request', 'POST', ['api', 'v1', 'users', 'me', 'security-change-requests'], {
      body: '{}',
    }),
    R('Upload avatar', 'POST', ['api', 'v1', 'users', 'me', 'avatar'], {
      body: '{}',
      description: 'Multipart form-data.',
    }),
    R('Update FCM token', 'PATCH', ['api', 'v1', 'users', 'me', 'fcm-token'], {
      body: '{\n  "token": "device-token"\n}',
    }),
    R('Pending security requests', 'GET', ['api', 'v1', 'users', 'security-change-requests', 'pending']),
    R('Approve security request', 'POST', [
      'api', 'v1', 'users', 'security-change-requests', ':id', 'approve',
    ], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Reject security request', 'POST', [
      'api', 'v1', 'users', 'security-change-requests', ':id', 'reject',
    ], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Get user', 'GET', ['api', 'v1', 'users', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('Patch user', 'PATCH', ['api', 'v1', 'users', ':id'], {
      variables: [{ key: 'id', value: '1' }],
      body: '{}',
    }),
    R('Delete user', 'DELETE', ['api', 'v1', 'users', ':id'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('User wallets', 'GET', ['api', 'v1', 'users', ':id', 'wallets'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('User onchain txs', 'GET', ['api', 'v1', 'users', ':id', 'onchain-transactions'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('User security changes', 'GET', ['api', 'v1', 'users', ':id', 'security-changes'], {
      variables: [{ key: 'id', value: '1' }],
    }),
    R('User orders', 'GET', ['api', 'v1', 'users', ':id', 'orders'], {
      variables: [{ key: 'id', value: '1' }],
      query: [{ key: 'page', value: '1' }, { key: 'limit', value: '20' }],
    }),
  ],
  'User management',
);

// ─── Wallets ───────────────────────────────────────────────────────────────────
const wallets = folder(
  'Wallets',
  [
    R('List', 'GET', ['api', 'v1', 'wallets']),
    R('Balance', 'GET', ['api', 'v1', 'wallets', 'balance'], {
      query: [{ key: 'currencyId', value: '1' }],
    }),
    R('Ledger', 'GET', ['api', 'v1', 'wallets', 'ledger'], {
      query: [{ key: 'page', value: '1' }, { key: 'limit', value: '20' }],
    }),
    R('Sync', 'POST', ['api', 'v1', 'wallets', 'sync'], { body: '{}' }),
    R('Exchange balance', 'GET', ['api', 'v1', 'wallets', 'exchange-balance']),
    R('Reconciliation status', 'GET', ['api', 'v1', 'wallets', 'reconciliation-status']),
    R('Export reconciliation', 'POST', ['api', 'v1', 'wallets', 'reconciliation-report', 'export'], {
      body: '{}',
    }),
    R('Admin adjust', 'POST', ['api', 'v1', 'wallets', 'admin', 'adjust'], { body: '{}' }),
    R('Admin adjustments by user', 'GET', ['api', 'v1', 'wallets', 'admin', 'adjustments', ':userId'], {
      variables: [{ key: 'userId', value: '1' }],
    }),
  ],
  'User wallet operations',
);

// ─── Blockchain ────────────────────────────────────────────────────────────────
const blockchain = folder(
  'Blockchain',
  [
    R('Request link wallet', 'POST', ['api', 'v1', 'blockchain', 'wallets', 'request-link'], {
      body: '{}',
    }),
    R('Verify link', 'POST', ['api', 'v1', 'blockchain', 'wallets', 'verify-link'], {
      body: '{}',
    }),
    R('Linked wallets', 'GET', ['api', 'v1', 'blockchain', 'wallets']),
    R('Wallet balance', 'GET', ['api', 'v1', 'blockchain', 'wallets', ':linkId', 'balance'], {
      variables: [{ key: 'linkId', value: '1' }],
    }),
    R('Unlink wallet', 'DELETE', ['api', 'v1', 'blockchain', 'wallets', ':linkId'], {
      variables: [{ key: 'linkId', value: '1' }],
    }),
    R('Deposit address', 'GET', ['api', 'v1', 'blockchain', 'deposit', 'address'], {
      query: [{ key: 'chain', value: 'TRON_NILE' }],
    }),
    R('Deposit preview', 'GET', ['api', 'v1', 'blockchain', 'deposit', 'preview'], {
      query: [{ key: 'txHash', value: 'tx-hash' }, { key: 'chain', value: 'TRON_NILE' }],
    }),
    R('Deposit submit', 'POST', ['api', 'v1', 'blockchain', 'deposit', 'submit'], {
      body: '{\n  "chain": "TRON_NILE",\n  "txHash": "57d7141773986b7941e53f30311d455cb631aead463e6b17a16ffc6862a031a4",\n  "amount": "1"\n}',
    }),
    R('Deposit settle', 'POST', ['api', 'v1', 'blockchain', 'deposit', ':txId', 'settle'], {
      variables: [{ key: 'txId', value: 'tx-id' }],
      body: '{}',
    }),
    R('Withdraw request', 'POST', ['api', 'v1', 'blockchain', 'withdraw', 'request'], {
      body: '{}',
    }),
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
    R('Networks', 'GET', ['api', 'v1', 'blockchain', 'networks']),
    R('Admin withdrawals stats', 'GET', ['api', 'v1', 'blockchain', 'admin', 'withdrawals', 'stats']),
    R('Admin withdrawal by id', 'GET', ['api', 'v1', 'blockchain', 'admin', 'withdrawals', ':txId'], {
      variables: [{ key: 'txId', value: 'tx-id' }],
    }),
    R('Admin withdrawals list', 'GET', ['api', 'v1', 'blockchain', 'admin', 'withdrawals']),
    R('Admin ingest deposit', 'POST', ['api', 'v1', 'blockchain', 'admin', 'deposits', 'ingest'], {
      body: '{\n  "chain": "TRON_NILE",\n  "txHash": "57d7141773986b7941e53f30311d455cb631aead463e6b17a16ffc6862a031a4"\n}',
    }),
    R('Admin unmatched deposits', 'GET', ['api', 'v1', 'blockchain', 'admin', 'deposits', 'unmatched']),
    R('Admin match deposit to user', 'POST', ['api', 'v1', 'blockchain', 'admin', 'deposits', ':txId', 'match-user'], {
      variables: [{ key: 'txId', value: 'tx-id' }],
      body: '{\n  "userId": "1"\n}',
    }),
  ],
  'On-chain wallet / deposit / withdraw',
);

// ─── WalletConnect ─────────────────────────────────────────────────────────────
const walletConnect = folder(
  'WalletConnect',
  [
    R('WC init', 'POST', ['api', 'v1', 'blockchain', 'wallets', 'wc', 'init'], { body: '{}' }),
    R('WC status', 'GET', ['api', 'v1', 'blockchain', 'wallets', 'wc', 'status', ':sessionId'], {
      variables: [{ key: 'sessionId', value: 'session-id' }],
    }),
    R('WC submit', 'POST', ['api', 'v1', 'blockchain', 'wallets', 'wc', 'submit'], { body: '{}' }),
    R('WC relay webhook', 'POST', ['api', 'v1', 'blockchain', 'wallets', 'wc', 'relay-webhook'], {
      body: '{}',
      noAuth: true,
      description: 'Server-to-server webhook — no JWT.',
    }),
  ],
  'WalletConnect v2 integration',
);

// ─── Managed Wallets ────────────────────────────────────────────────────────────
const managedWallets = folder(
  'Managed Wallets',
  [
    R('Create', 'POST', ['api', 'v1', 'managed-wallets'], { body: '{}' }),
    R('List', 'GET', ['api', 'v1', 'managed-wallets']),
    R('Deposit defaults', 'GET', ['api', 'v1', 'managed-wallets', 'deposit-defaults']),
    R('Patch recommended chain', 'PATCH', ['api', 'v1', 'managed-wallets', 'settings', 'recommended-chain'], {
      body: '{\n  "chain": "TRON_NILE"\n}',
    }),
    R('Get by id', 'GET', ['api', 'v1', 'managed-wallets', ':walletId'], {
      variables: [{ key: 'walletId', value: '1' }],
    }),
    R('Transactions', 'GET', ['api', 'v1', 'managed-wallets', ':walletId', 'transactions'], {
      variables: [{ key: 'walletId', value: '1' }],
    }),
    R('Send', 'POST', ['api', 'v1', 'managed-wallets', ':walletId', 'send'], {
      variables: [{ key: 'walletId', value: '1' }],
      body: '{\n  "to_address": "TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9",\n  "amount": "10"\n}',
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

// ─── Deposit Methods ────────────────────────────────────────────────────────────
const depositMethods = folder(
  'Deposit Methods',
  [R('List methods', 'GET', ['api', 'v1', 'deposit', 'methods'], { noAuth: true })],
  'Public deposit addresses',
);

// ─── Deposits (Fiat) ───────────────────────────────────────────────────────────
const deposits = folder(
  'Deposits (Fiat)',
  [
    R('Create fiat deposit', 'POST', ['api', 'v1', 'deposits'], {
      body: '{\n  "amount": 100000,\n  "currency": "VND"\n}',
    }),
    R('List my deposits', 'GET', ['api', 'v1', 'deposits']),
    R('Checkout meta', 'GET', ['api', 'v1', 'deposits', 'checkout-meta']),
    R('Sync status', 'GET', ['api', 'v1', 'deposits', ':orderCode', 'sync-status'], {
      variables: [{ key: 'orderCode', value: 'ORDER_CODE' }],
    }),
    R('Admin all', 'GET', ['api', 'v1', 'deposits', 'admin', 'all']),
    R('PayOS webhook', 'POST', ['api', 'v1', 'deposits', 'payos-webhook'], {
      body: '{}',
      noAuth: true,
      description: 'Server-to-server — signature headers theo PayOS.',
    }),
  ],
  'Fiat deposits via PayOS',
);

// ─── PayOS Redirect ─────────────────────────────────────────────────────────────
const payosRedirect = folder(
  'PayOS Redirect',
  [
    {
      name: 'Success',
      request: {
        method: 'GET',
        header: [],
        url: makeUrl(['success']),
        description: 'Browser redirect — no /api/v1 prefix.',
      },
      response: [],
    },
    {
      name: 'Cancel',
      request: {
        method: 'GET',
        header: [],
        url: makeUrl(['cancel']),
        description: 'Browser redirect — no /api/v1 prefix.',
      },
      response: [],
    },
  ],
  'GET /success và /cancel (PayOS)',
);

// ─── Exchange ───────────────────────────────────────────────────────────────────
const exchange = folder('Exchange', [
  R('Sync info', 'POST', ['api', 'v1', 'exchange', 'sync-info'], { body: '{}' }),
], 'CEX sync');

// ─── Exchange Rate ──────────────────────────────────────────────────────────────
const exchangeRate = folder(
  'Exchange Rate',
  [
    R('Market prices', 'GET', ['api', 'v1', 'exchange-rate', 'market-prices']),
    R('Deposit preview', 'GET', ['api', 'v1', 'exchange-rate', 'deposit-preview'], {
      query: [{ key: 'amount', value: '100' }, { key: 'fromCurrency', value: 'VND' }],
    }),
    R('Admin current config', 'GET', ['api', 'v1', 'exchange-rate', 'admin', 'current-config']),
    R('Admin sync', 'POST', ['api', 'v1', 'exchange-rate', 'admin', 'sync'], { body: '{}' }),
    R('Admin update config', 'PATCH', ['api', 'v1', 'exchange-rate', 'admin', 'config'], {
      body: '{}',
    }),
  ],
  'Exchange rate management',
);

// ─── Notifications ──────────────────────────────────────────────────────────────
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
  'User notifications',
);

// ─── Treasury ──────────────────────────────────────────────────────────────────
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
    R('Set default main wallet', 'PATCH', ['api', 'v1', 'treasury', 'main-wallets', ':mainWalletId', 'set-default'], {
      variables: [{ key: 'mainWalletId', value: '1' }],
      body: '{}',
    }),
    R('Reveal private key', 'POST', ['api', 'v1', 'treasury', 'main-wallets', ':mainWalletId', 'reveal-private-key'], {
      variables: [{ key: 'mainWalletId', value: '1' }],
      body: '{}',
    }),
    R('Patch main wallet', 'PATCH', ['api', 'v1', 'treasury', 'main-wallets', ':mainWalletId'], {
      variables: [{ key: 'mainWalletId', value: '1' }],
      body: '{}',
    }),
    R('Request deletion', 'PATCH', ['api', 'v1', 'treasury', 'main-wallets', ':mainWalletId', 'request-deletion'], {
      variables: [{ key: 'mainWalletId', value: '1' }],
      body: '{}',
    }),
    R('Approve deletion', 'PATCH', ['api', 'v1', 'treasury', 'main-wallets', ':mainWalletId', 'approve-deletion'], {
      variables: [{ key: 'mainWalletId', value: '1' }],
      body: '{}',
    }),
    R('Reject deletion', 'PATCH', ['api', 'v1', 'treasury', 'main-wallets', ':mainWalletId', 'reject-deletion'], {
      variables: [{ key: 'mainWalletId', value: '1' }],
      body: '{}',
    }),
    R('Operations', 'GET', ['api', 'v1', 'treasury', 'operations']),
    R('Operation by id', 'GET', ['api', 'v1', 'treasury', 'operations', ':operationId'], {
      variables: [{ key: 'operationId', value: '1' }],
    }),
    R('Manual retry', 'POST', ['api', 'v1', 'treasury', 'operations', ':operationId', 'manual-retry'], {
      variables: [{ key: 'operationId', value: '1' }],
      body: '{}',
    }),
    R('Manual abort', 'POST', ['api', 'v1', 'treasury', 'operations', ':operationId', 'manual-abort'], {
      variables: [{ key: 'operationId', value: '1' }],
      body: '{}',
    }),
    R('Manual settle', 'POST', ['api', 'v1', 'treasury', 'operations', ':operationId', 'manual-settle'], {
      variables: [{ key: 'operationId', value: '1' }],
      body: '{}',
    }),
    R('Transactions', 'GET', ['api', 'v1', 'treasury', 'transactions']),
  ],
  'Treasury operations',
);

// ─── Market Maker ──────────────────────────────────────────────────────────────
const marketMaker = folder(
  'Market Maker',
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
  'Market maker configuration',
);

// ─── Outbox Admin ─────────────────────────────────────────────────────────────
const outboxAdmin = folder(
  'Outbox Admin',
  [
    R('Dead letter queue', 'GET', ['api', 'v1', 'admin', 'outbox', 'dead-letter']),
    R('Requeue dead letter', 'POST', ['api', 'v1', 'admin', 'outbox', 'dead-letter', ':id', 'requeue']),
    R('Requeue all dead letters', 'POST', ['api', 'v1', 'admin', 'outbox', 'dead-letter', 'requeue']),
    R('Replay audits', 'GET', ['api', 'v1', 'admin', 'outbox', 'replay-audits']),
    R('Relay health', 'GET', ['api', 'v1', 'admin', 'outbox', 'relay-health']),
    R('Purge abandoned', 'POST', ['api', 'v1', 'admin', 'outbox', 'purge-abandoned'], { body: '{}' }),
  ],
  'Outbox relay management',
);

// ─── Metadata ─────────────────────────────────────────────────────────────────
const metadata = folder(
  'Metadata',
  [R('Admin enums', 'GET', ['api', 'v1', 'enums'], { description: 'Ops roles only.' })],
  'Reference values',
);

// ─── Collection ────────────────────────────────────────────────────────────────
const collection = {
  info: {
    _postman_id: 'cryptocurrency-trading-api',
    name: 'Cryptocurrency Trading API',
    description:
      'Collection đầy đủ theo module NestJS (`api/v1`).\n\n**Environment:** `base_url`, `access_token` (Login lưu token).\n\n**Regenerate:** `npm run postman:build` (chạy `postman/build-collection.mjs`).\n\nMột số body là placeholder — đối chiếu Swagger tại `/api/docs` (non-production).',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    health,
    auth,
    dashboard,
    systemConfig,
    paymentConfig,
    treasuryE2E,
    depositWatcher,
    currencies,
    markets,
    orders,
    tradingOps,
    users,
    wallets,
    blockchain,
    walletConnect,
    managedWallets,
    depositMethods,
    deposits,
    payosRedirect,
    exchange,
    exchangeRate,
    notifications,
    treasury,
    marketMaker,
    outboxAdmin,
    metadata,
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
