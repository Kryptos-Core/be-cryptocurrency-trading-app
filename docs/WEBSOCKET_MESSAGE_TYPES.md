# 🔌 WebSocket Message Types Reference

Complete TypeScript interfaces for Frontend developers integrating with the Backend WebSocket API.

---

## 📨 Message Types

### **Authentication Flow**

#### 1. Send Auth Message
```typescript
type: 'auth'
{
  type: 'auth',
  data: {
    token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  },
  timestamp: 1707044962848
}
```

#### 2. Receive Auth Response
```typescript
type: 'auth_response'
{
  type: 'auth_response',
  data: {
    success: true,
    message: 'Authentication successful',
    user_id: 123,
    permissions: ['read:markets', 'write:trades']
  },
  timestamp: 1707044962900
}
```

---

### **Subscription Flow**

#### 1. Send Subscribe Message
```typescript
type: 'subscribe'
{
  type: 'subscribe',
  data: {
    pair_id: 1,                    // Market pair ID
    channels: ['ticker', 'ohlc'],  // Subscription channels
    interval: '5m'                 // For OHLC candles (optional)
  },
  timestamp: 1707044962950
}
```

#### 2. Receive Subscribed Confirmation
```typescript
type: 'subscribed'
{
  type: 'subscribed',
  data: {
    pair_id: 1,
    channels: ['ticker', 'ohlc'],
    interval: '5m',
    subscribed_at: 1707044962950
  },
  timestamp: 1707044962950
}
```

#### 3. Send Unsubscribe Message
```typescript
type: 'unsubscribe'
{
  type: 'unsubscribe',
  data: {
    pair_id: 1,
    channels: ['ticker']
  },
  timestamp: 1707044963000
}
```

---

### **Real-time Data Streams**

#### 1. Ticker Update (HIGH FREQUENCY - 10+ per second)
```typescript
type: 'ticker'
{
  type: 'ticker',
  data: {
    pair_id: 1,
    symbol: 'BTC/USDT',
    last_price: '73920.00',
    bid: '73919.50',
    ask: '73920.50',
    volume_24h: '12345.67',
    volume_24h_usd: '912345678.90',
    change_24h: '1234.56',
    change_percent_24h: '1.69',
    high_24h: '75000.00',
    low_24h: '72000.00',
    open_24h: '72685.44'
  },
  timestamp: 1707044963100
}
```

**Frequency**: 10+ per second per pair
**Action**: Buffer and throttle to 300ms in frontend

#### 2. OHLC Candle Update (Lower frequency - per candle interval)
```typescript
type: 'ohlc'
{
  type: 'ohlc',
  data: {
    pair_id: 1,
    symbol: 'BTC/USDT',
    interval: '5m',
    open_time: 1707044700000,
    close_time: 1707044999999,
    open: '73800.00',
    high: '74000.00',
    low: '73700.00',
    close: '73920.00',
    volume: '123.456',
    quote_asset_volume: '9123456.78'
  },
  timestamp: 1707044963100
}
```

**Frequency**: Once per interval (1m, 5m, 15m, 1h, 4h, 1d)
**Action**: Update candlestick chart directly

---

### **Heartbeat**

#### Ping Message (from server every 30 seconds)
```typescript
type: 'ping'
{
  type: 'ping',
  timestamp: 1707044963100
}
```

#### Pong Response (must send back)
```typescript
type: 'pong'
{
  type: 'pong',
  timestamp: 1707044963150
}
```

---

### **Error Handling**

#### Error Message
```typescript
type: 'error'
{
  type: 'error',
  error: {
    code: 'SUBSCRIPTION_FAILED',
    message: 'Failed to subscribe to pair 1',
    details: {
      pair_id: 1,
      channel: 'ticker',
      reason: 'Market pair not found'
    }
  },
  timestamp: 1707044963200
}
```

**Error Codes**:
- `AUTH_FAILED` - Authentication failed
- `AUTH_REQUIRED` - Must authenticate first
- `SUBSCRIPTION_FAILED` - Failed to subscribe
- `INVALID_CHANNEL` - Unknown channel type
- `INVALID_PAIR` - Market pair not found
- `RATE_LIMIT` - Too many requests

---

## 🎯 Complete TypeScript Interfaces

```typescript
// Base message structure
interface WebSocketMessage<T = any> {
  type: WebSocketMessageType;
  data?: T;
  timestamp?: number;
  error?: WebSocketError;
}

type WebSocketMessageType =
  | 'auth'
  | 'auth_response'
  | 'subscribe'
  | 'subscribed'
  | 'unsubscribe'
  | 'unsubscribed'
  | 'ticker'
  | 'ohlc'
  | 'error'
  | 'ping'
  | 'pong';

// Authentication
interface AuthMessage {
  token: string;
}

interface AuthResponseMessage {
  success: boolean;
  message: string;
  user_id?: number;
  permissions?: string[];
}

// Subscription
interface SubscribeMessage {
  pair_id: number;
  channels: SubscriptionChannel[];
  interval?: CandleInterval;
}

interface SubscribedMessage {
  pair_id: number;
  channels: SubscriptionChannel[];
  interval?: CandleInterval;
  subscribed_at: number;
}

interface UnsubscribeMessage {
  pair_id: number;
  channels: SubscriptionChannel[];
}

interface UnsubscribedMessage {
  pair_id: number;
  channels: SubscriptionChannel[];
}

type SubscriptionChannel = 'ticker' | 'ohlc';
type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// Real-time Data
interface TickerMessage {
  pair_id: number;
  symbol: string;
  last_price: string;
  bid: string;
  ask: string;
  volume_24h: string;
  volume_24h_usd: string;
  change_24h: string;
  change_percent_24h: string;
  high_24h: string;
  low_24h: string;
  open_24h: string;
}

interface OHLCMessage {
  pair_id: number;
  symbol: string;
  interval: CandleInterval;
  open_time: number;
  close_time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quote_asset_volume: string;
}

// Errors
interface WebSocketError {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
}

type ErrorCode =
  | 'AUTH_FAILED'
  | 'AUTH_REQUIRED'
  | 'SUBSCRIPTION_FAILED'
  | 'INVALID_CHANNEL'
  | 'INVALID_PAIR'
  | 'RATE_LIMIT'
  | 'UNKNOWN_ERROR';
```

---

## 🔄 Connection Lifecycle

```
Client                          Server
  │                               │
  ├──────── connect ────────────→ │
  │                               │
  ├─────── auth message ────────→ │
  │                               │
  │ ←───── auth_response ────────┤
  │                               │
  ├──── subscribe message ───────→ │
  │                               │
  │ ←──── subscribed response ────┤
  │                               │
  │ ←─────── ticker (10+/sec) ───┤
  │                               │
  │ ←────── ohlc (per interval)──┤
  │                               │
  │ ←─────────── ping ──────────┤ (every 30s)
  │                               │
  ├─────────── pong ────────────→ │
  │                               │
  ├──── unsubscribe message ─────→ │
  │                               │
  │ ←─── unsubscribed response ───┤
  │                               │
  ├──────── disconnect ──────────→ │
```

---

## 📊 Data Value Ranges

All numeric values are sent as **strings** to preserve precision:

```typescript
// Example ticker data
{
  last_price: '73920.1234567890',    // Full precision
  bid: '73919.5000000000',            // Can have many decimals
  ask: '73920.5000000000',
  volume_24h: '12345.67890123',       // Large numbers as strings
  change_24h: '1234.56789012',
  change_percent_24h: '1.6912345678'
}

// Parse to number when needed
const price = parseFloat(tickerMessage.last_price);
const change = Number(tickerMessage.change_24h);
```

**Why strings?**
- Preserve decimal precision (JavaScript numbers lose precision after 15 digits)
- Avoid floating-point arithmetic errors
- Display exactly as database stores
- Safe for big numbers

---

## ⚡ Quick Start for Frontend

```typescript
import io from 'socket.io-client';

// 1. Connect
const socket = io('http://localhost:3000/trading', {
  auth: { token: 'Bearer YOUR_JWT_TOKEN' },
});

// 2. Listen for auth response
socket.on('auth_response', (msg) => {
  if (msg.data.success) {
    console.log('✅ Authenticated');
    
    // 3. Subscribe to BTC/USDT (pair_id: 1)
    socket.emit('subscribe', {
      type: 'subscribe',
      data: {
        pair_id: 1,
        channels: ['ticker']
      }
    });
  }
});

// 4. Listen for ticker updates
socket.on('ticker', (msg) => {
  const { pair_id, symbol, last_price, bid, ask } = msg.data;
  console.log(`${symbol}: ${last_price} (bid: ${bid}, ask: ${ask})`);
});

// 5. Respond to pings
socket.on('ping', () => {
  socket.emit('pong', { timestamp: Date.now() });
});

// 6. Handle errors
socket.on('error', (msg) => {
  console.error('WebSocket error:', msg.error);
});

// 7. Cleanup on disconnect
socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

---

## 🧪 Testing the WebSocket

Use this HTML file to test the WebSocket connection:

```html
<!-- websocket-test.html -->
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Test</title>
  <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
</head>
<body>
  <h1>WebSocket Test</h1>
  <div id="log" style="border: 1px solid #ccc; height: 500px; overflow-y: auto; padding: 10px; font-family: monospace; font-size: 12px;"></div>
  <button onclick="subscribe()">Subscribe BTC/USDT</button>
  <button onclick="unsubscribe()">Unsubscribe</button>

  <script>
    const token = 'YOUR_JWT_TOKEN';
    const socket = io('http://localhost:3000/trading', {
      auth: { token: `Bearer ${token}` }
    });

    const log = document.getElementById('log');

    function logMessage(msg) {
      log.innerHTML += `<div>${new Date().toISOString()}: ${JSON.stringify(msg)}</div>`;
      log.scrollTop = log.scrollHeight;
    }

    socket.on('connect', () => logMessage('✅ Connected'));
    socket.on('auth_response', (msg) => logMessage(`Auth: ${msg.data.success}`));
    socket.on('ticker', (msg) => logMessage(`Ticker: ${msg.data.symbol} ${msg.data.last_price}`));
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
      logMessage('Pong sent');
    });
    socket.on('error', (msg) => logMessage(`Error: ${msg.error?.code}`));
    socket.on('disconnect', () => logMessage('❌ Disconnected'));

    function subscribe() {
      socket.emit('subscribe', {
        type: 'subscribe',
        data: { pair_id: 1, channels: ['ticker'] }
      });
    }

    function unsubscribe() {
      socket.emit('unsubscribe', {
        type: 'unsubscribe',
        data: { pair_id: 1, channels: ['ticker'] }
      });
    }

    // Auto-authenticate
    setTimeout(() => {
      socket.emit('auth', { type: 'auth', data: { token: `Bearer ${token}` } });
    }, 1000);
  </script>
</body>
</html>
```

Save this as `websocket-test.html` and open in browser after replacing `YOUR_JWT_TOKEN`.