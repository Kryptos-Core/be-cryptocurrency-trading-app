# Redis Integration - Hướng Dẫn Sử Dụng

## Tổng Quan

Redis đã được tích hợp vào project với các tính năng:
- Connection pooling và error handling
- Pub/Sub support
- Cache service wrapper
- Bull queue support (sẵn sàng)

## Cấu Hình

### Environment Variables

Thêm vào file `.env`:

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
```

### Docker Compose

Redis đã được thêm vào `docker-compose.infrastructure.yml`. Chạy:

```bash
docker-compose -f docker-compose.infrastructure.yml up -d redis
```

## Sử Dụng Redis Service

### Inject RedisService

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from '@/common/services';

@Injectable()
export class YourService {
  constructor(private readonly redisService: RedisService) {}

  async example() {
    // Set value
    await this.redisService.set('key', 'value', 3600); // TTL 1 hour

    // Get value
    const value = await this.redisService.get('key');

    // Delete key
    await this.redisService.del('key');

    // Hash operations
    await this.redisService.hset('user:1', 'name', 'John');
    const name = await this.redisService.hget('user:1', 'name');
    const user = await this.redisService.hgetall('user:1');

    // Set operations
    await this.redisService.sadd('users:active', 'user1', 'user2');
    const members = await this.redisService.smembers('users:active');

    // Increment/Decrement
    await this.redisService.incr('counter');
    await this.redisService.incrby('counter', 5);
  }
}
```

## Sử Dụng Cache Service

CacheService là wrapper tiện lợi cho caching operations:

```typescript
import { Injectable } from '@nestjs/common';
import { CacheService } from '@/common/services';

@Injectable()
export class YourService {
  constructor(private readonly cacheService: CacheService) {}

  async example() {
    // Set cache với object
    await this.cacheService.set('user:1', { id: 1, name: 'John' }, 3600);

    // Get cache
    const user = await this.cacheService.get<{ id: number; name: string }>('user:1');

    // Get or Set pattern (Cache-Aside)
    const data = await this.cacheService.getOrSet(
      'expensive:data',
      async () => {
        // Fetch from database
        return await this.fetchFromDatabase();
      },
      3600, // TTL
    );

    // Invalidate pattern
    await this.cacheService.invalidatePattern('user:*');

    // Check existence
    const exists = await this.cacheService.exists('key');
  }
}
```

## Pub/Sub Pattern

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from '@/common/services';

@Injectable()
export class NotificationService {
  constructor(private readonly redisService: RedisService) {}

  // Publish message
  async publishPriceUpdate(pair: string, price: number) {
    await this.redisService.publish(
      `price:${pair}`,
      JSON.stringify({ pair, price, timestamp: Date.now() }),
    );
  }

  // Subscribe to channel
  async subscribeToPriceUpdates(pair: string, callback: (price: number) => void) {
    await this.redisService.subscribe(`price:${pair}`, (message) => {
      const data = JSON.parse(message);
      callback(data.price);
    });
  }
}
```

## Best Practices

1. **Always set TTL**: Tránh memory leak
   ```typescript
   await this.cacheService.set('key', value, 3600);
   ```

2. **Use Cache-Aside Pattern**: 
   ```typescript
   const data = await this.cacheService.getOrSet('key', factory, ttl);
   ```

3. **Invalidate cache khi update data**:
   ```typescript
   await this.updateDatabase(data);
   await this.cacheService.delete('key');
   ```

4. **Use patterns cho bulk operations**:
   ```typescript
   await this.cacheService.invalidatePattern('user:*');
   ```

5. **Handle errors**: Redis service đã có error handling tự động

## Connection Management

RedisService tự động:
- Connect khi module init
- Reconnect khi connection lost
- Close connections khi module destroy
- Log tất cả events

## Monitoring

Redis service logs:
- Connection events
- Errors
- Reconnection attempts

Check logs để monitor Redis health.
