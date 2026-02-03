# WebSocket API Documentation

## Overview

The WebSocket API provides real-time streaming of trading data (ticker prices and OHLC candles) to connected clients. It uses Socket.io with Redis Pub/Sub for horizontal scalability across multiple server instances.

**Base URL:** `ws://localhost:3000/trading`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Browser)                       │
│                    WebSocket Client                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Socket.io
                 │
┌────────────────▼────────────────────────────────────────────┐
│            Trading WebSocket Gateway                         │
│  • Connection/Disconnection handling                         │
│  • JWT Authentication                                        │
│  • Message routing                                           │
│  • Subscription management                                   │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
   ┌────▼──────────┐  ┌──▼────────────────┐
   │Redis Pub/Sub  │  │Trading Services   │
   │               │  │                   │
   │Channels:      │  │• TradingGateway   │
   │• trading:     │  │• Subscription Svc │
   │  price_update │  │• Price Stream Svc │
   │• trading:     │  │                   │
   │  candle_update│  └───────────────────┘
   └───────────────┘
        │
        │
   ┌────▼──────────────┐
   │Binance Exchange   │
   │API                │
   └───────────────────┘
```

## Connection Flow

### 1. Client Connects
```
Client connects to ws://localhost:3000/trading
Server logs: "Trading WebSocket Gateway initialized"
```

### 2. Client Authenticates
```javascript
// Client sends
socket.emit('auth', { token: 'jwt_token_here' });

// Server responds with
socket.on('auth_response', { 
  authenticated: true|false,
  error?: 'error message'
});
```

### 3. Client Subscribes to Updates
```javascript
// Client sends
socket.emit('subscribe', {
  pair_id: 1,        // Market pair ID
  channel: 'ticker', // 'ticker' or 'ohlc'
  interval?: '1m'    // Required if channel='ohlc'
});

// Server starts broadcasting price updates on this room
```

### 4. Client Receives Updates
```javascript
// Ticker updates
socket.on('ticker', {
  pair_id: 1,
  symbol: 'BTCUSDT',
  last_price: '42150.50',
  high_24h: '43000.00',
  low_24h: '41000.00',
  volume_24h: '15234.32',
  change_24h_percent: '2.50',
  timestamp: 1706900000000
});

// OHLC updates
socket.on('ohlc', {
  pair_id: 1,
  symbol: 'BTCUSDT',
  interval: '1m',
  open: '42000.00',
  high: '42150.50',
  low: '41950.00',
  close: '42100.00',
  volume: '125.50',
  timestamp: 1706900000000
});
```

## Message Types

### Authentication

#### Request
```json
{
  "type": "auth",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Response
```json
{
  "type": "auth_response",
  "authenticated": true,
  "timestamp": 1706900000000
}
```

Or on error:
```json
{
  "type": "error",
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Invalid or expired token"
  },
  "timestamp": 1706900000000
}
```

### Subscription

#### Subscribe Request
```json
{
  "type": "subscribe",
  "data": {
    "pair_id": 1,
    "channel": "ticker",
    "interval": "1m"
  }
}
```

#### Unsubscribe Request
```json
{
  "type": "unsubscribe",
  "data": {
    "pair_id": 1,
    "channel": "ticker"
  }
}
```

### Data Updates

#### Ticker Message
```json
{
  "type": "ticker",
  "symbol": "BTCUSDT",
  "pair_id": 1,
  "last_price": "42150.50",
  "high_24h": "43000.00",
  "low_24h": "41000.00",
  "volume_24h": "15234.32",
  "change_24h_percent": "2.50",
  "timestamp": 1706900000000
}
```

#### OHLC Message
```json
{
  "type": "ohlc",
  "symbol": "BTCUSDT",
  "pair_id": 1,
  "interval": "1m",
  "open": "42000.00",
  "high": "42150.50",
  "low": "41950.00",
  "close": "42100.00",
  "volume": "125.50",
  "timestamp": 1706900000000
}
```

### Error Message
```json
{
  "type": "error",
  "error": {
    "code": "INVALID_PAIR",
    "message": "Market pair not found"
  },
  "timestamp": 1706900000000
}
```

## Error Codes

| Code | Description | HTTP Equivalent |
|------|-------------|-----------------|
| `AUTH_REQUIRED` | Client not authenticated | 401 |
| `INVALID_TOKEN` | JWT token is invalid/expired | 401 |
| `INVALID_PAIR` | Market pair ID doesn't exist | 404 |
| `SUBSCRIPTION_LIMIT` | Too many subscriptions (max 20) | 429 |
| `INVALID_CHANNEL` | Channel must be 'ticker' or 'ohlc' | 400 |
| `INVALID_INTERVAL` | Interval invalid for OHLC | 400 |
| `SERVER_ERROR` | Internal server error | 500 |

## Rate Limiting

### Per-Client Limits
- **Max Subscriptions:** 20 subscriptions per client
- **Ping Timeout:** 30 second heartbeat interval
- **Auth Timeout:** 10 seconds to authenticate after connection

### Per-Pair Limits
- **Max Clients:** 10,000 concurrent clients per market pair

## Heartbeat/Ping-Pong

The server sends ping messages every 30 seconds. Clients should respond with pong:

```javascript
socket.on('ping', () => {
  socket.emit('pong', { timestamp: Date.now() });
});
```

## Example: JavaScript Client

```javascript
import io from 'socket.io-client';

// Connect
const socket = io('http://localhost:3000/trading', {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

// Handle connection
socket.on('connect', () => {
  console.log('Connected to WebSocket');
  
  // Authenticate
  const token = localStorage.getItem('jwt_token');
  socket.emit('auth', { token });
});

// Handle authentication response
socket.on('auth_response', (response) => {
  if (response.authenticated) {
    console.log('Authenticated!');
    
    // Subscribe to ticker
    socket.emit('subscribe', {
      pair_id: 1,
      channel: 'ticker'
    });
    
    // Subscribe to 1m candles
    socket.emit('subscribe', {
      pair_id: 1,
      channel: 'ohlc',
      interval: '1m'
    });
  } else {
    console.error('Auth failed:', response.error);
  }
});

// Handle ticker updates
socket.on('ticker', (data) => {
  console.log(`${data.symbol}: $${data.last_price}`);
});

// Handle OHLC updates
socket.on('ohlc', (data) => {
  console.log(`${data.symbol} (${data.interval}): O:${data.open} C:${data.close}`);
});

// Handle errors
socket.on('error', (error) => {
  console.error('Error:', error.message);
});

// Handle disconnect
socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket');
});
```

## Testing

### Using the Test Client

Open [websocket-test.html](../websocket-test.html) in a browser:

1. Get a JWT token from `/api/v1/auth/login`
2. Paste the token in the input field
3. Click "Connect"
4. Enter a pair ID (e.g., 1 for BTCUSDT)
5. Select channel (ticker or ohlc)
6. Click "Subscribe"
7. Watch real-time updates in the log

### Using cURL (for connection only)

```bash
# Connect and authenticate
websocat ws://localhost:3000/trading \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Send auth message
{"type":"auth","token":"YOUR_JWT_TOKEN"}

# Subscribe to ticker
{"type":"subscribe","data":{"pair_id":1,"channel":"ticker"}}
```

## Implementation Details

### File Structure

```
src/modules/trading/
├── interfaces/
│   └── websocket.interface.ts     # Type definitions
├── websocket/
│   ├── trading.gateway.ts         # Main gateway
│   └── filters/
│       └── websocket-exception.filter.ts
├── services/
│   ├── trading-subscription.service.ts    # Subscription management
│   └── trading-price-stream.service.ts    # Redis Pub/Sub integration
└── trading.module.ts              # Module definition
```

### Key Components

#### TradingGateway
- Handles WebSocket connections
- Validates JWT authentication
- Manages subscriptions
- Broadcasts updates to subscribed clients
- Location: [src/modules/trading/websocket/trading.gateway.ts](../src/modules/trading/websocket/trading.gateway.ts)

#### TradingSubscriptionService
- Tracks active subscriptions per client
- Enforces rate limits (20 subs/client)
- Maintains pair → clients mapping
- Location: [src/modules/trading/services/trading-subscription.service.ts](../src/modules/trading/services/trading-subscription.service.ts)

#### TradingPriceStreamService
- Subscribes to Redis Pub/Sub channels
- Receives price/candle updates from data sources
- Forwards updates to gateway for broadcasting
- Location: [src/modules/trading/services/trading-price-stream.service.ts](../src/modules/trading/services/trading-price-stream.service.ts)

### Redis Integration

The system uses Redis Pub/Sub for scalability:

**Channels:**
- `trading:price_update` - Ticker/price updates
- `trading:candle_update` - OHLC candle updates

**Message Format:**
```json
{
  "event": "price_update|candle_update",
  "data": {
    "pair_id": 1,
    "ticker": { ...ticker_data },
    "timestamp": 1706900000000
  },
  "timestamp": 1706900000000
}
```

## Deployment Considerations

### Horizontal Scaling

With Redis Pub/Sub, multiple server instances automatically coordinate:
- Client A connects to Server 1
- Client B connects to Server 2
- When data arrives on Server 1, it publishes to Redis
- Server 2 receives the message and broadcasts to Client B

### Production Checklist

- [ ] Enable SSL/TLS (use `wss://` instead of `ws://`)
- [ ] Configure CORS properly
- [ ] Set up Redis replication for high availability
- [ ] Monitor WebSocket connections and memory usage
- [ ] Implement rate limiting middleware
- [ ] Enable connection logging/metrics
- [ ] Configure appropriate timeout values
- [ ] Set up alerting for disconnections

### Environment Variables

```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRATION=24h

# WebSocket
WS_PING_INTERVAL=30000    # 30 seconds
WS_AUTH_TIMEOUT=10000     # 10 seconds
WS_MAX_SUBSCRIPTIONS=20   # Per client
```

## Performance Optimization

### Current Implementation
- Redis Pub/Sub for multi-instance scaling
- Room-based broadcasting (`pair:X:ticker`, `pair:X:ohlc:interval`)
- Efficient JSON serialization
- Connection pooling via Redis

### Potential Improvements
- [ ] Implement message compression (gzip)
- [ ] Add batch updates for multiple pairs
- [ ] Cache hot tickers in memory
- [ ] Implement adaptive rate limiting
- [ ] Add circuit breaker for Binance API
- [ ] Monitor and alert on subscription patterns

## Troubleshooting

### Client Not Authenticating

**Problem:** `AUTH_REQUIRED` error on subscribe

**Solution:** 
- Ensure JWT token is valid (not expired)
- Check token format: `Bearer YOUR_TOKEN` or just `YOUR_TOKEN`
- Verify auth message is sent immediately after connection
- Check server logs for JWT verification errors

### Missing Updates

**Problem:** Connected but not receiving ticker/OHLC updates

**Solution:**
- Ensure Binance price feed is active (check logs)
- Verify Redis connection is working
- Check that subscription confirms success
- Monitor Redis channels: `redis-cli SUBSCRIBE trading:price_update`

### Connection Drops

**Problem:** WebSocket disconnects frequently

**Solution:**
- Check network connectivity
- Verify server is not running out of memory
- Increase ping timeout if behind proxy
- Check server logs for errors
- Ensure JWT token is not expiring mid-session

### High Memory Usage

**Problem:** Server memory grows over time

**Solution:**
- Check for subscription leaks (unsubscribe not called)
- Monitor active connections: `TradingSubscriptionService.getStats()`
- Verify client cleanup on disconnect
- Check Redis subscriber queue

## Future Enhancements

1. **Batch Updates** - Send multiple updates in one message
2. **Compression** - Add gzip compression for bandwidth savings
3. **History** - Include last N candles on subscription
4. **Aggregation** - Server-side OHLC aggregation
5. **Alerts** - Price alert notifications
6. **Analytics** - Track subscription patterns and usage
7. **Load Balancing** - Sticky sessions or state sharing
8. **Metrics** - Prometheus/OpenTelemetry integration
