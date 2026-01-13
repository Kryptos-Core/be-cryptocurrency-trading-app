import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

/**
 * Redis Service
 * Singleton Pattern: Single Redis connection instance
 * Adapter Pattern: Redis operations adapter
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;
  private subscriber!: Redis;
  private publisher!: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const config = this.getRedisConfig();
    
    // Main client for general operations
    // ioredis will auto-connect when instantiated
    this.client = new Redis(config);
    
    // Separate clients for pub/sub
    this.subscriber = new Redis(config);
    this.publisher = new Redis(config);

    // Event handlers
    this.setupEventHandlers(this.client, 'Client');
    this.setupEventHandlers(this.subscriber, 'Subscriber');
    this.setupEventHandlers(this.publisher, 'Publisher');

    // Wait for connections to be ready (ioredis auto-connects)
    // Add timeout to prevent blocking if Redis is unavailable
    const connectionTimeout = 10000; // 10 seconds
    
    try {
      await Promise.race([
        Promise.all([
          new Promise<void>((resolve, reject) => {
            if (this.client.status === 'ready') {
              resolve();
            } else {
              const readyHandler = () => resolve();
              const errorHandler = (err: Error) => reject(err);
              this.client.once('ready', readyHandler);
              this.client.once('error', errorHandler);
            }
          }),
          new Promise<void>((resolve, reject) => {
            if (this.subscriber.status === 'ready') {
              resolve();
            } else {
              const readyHandler = () => resolve();
              const errorHandler = (err: Error) => reject(err);
              this.subscriber.once('ready', readyHandler);
              this.subscriber.once('error', errorHandler);
            }
          }),
          new Promise<void>((resolve, reject) => {
            if (this.publisher.status === 'ready') {
              resolve();
            } else {
              const readyHandler = () => resolve();
              const errorHandler = (err: Error) => reject(err);
              this.publisher.once('ready', readyHandler);
              this.publisher.once('error', errorHandler);
            }
          }),
        ]),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis connection timeout')),
            connectionTimeout,
          ),
        ),
      ]);
      this.logger.log('Redis connections established');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to establish Redis connections: ${errorMessage}`);
      // Don't throw - allow app to start without Redis (graceful degradation)
      // Redis will retry to connect automatically
    }
  }

  async onModuleDestroy() {
    await Promise.all([
      this.client?.quit(),
      this.subscriber?.quit(),
      this.publisher?.quit(),
    ]);
    this.logger.log('Redis connections closed');
  }

  private setupEventHandlers(client: Redis, name: string) {
    client.on('connect', () => {
      this.logger.log(`Redis ${name} connected`);
    });

    client.on('ready', () => {
      this.logger.log(`Redis ${name} ready`);
    });

    client.on('error', (error) => {
      this.logger.error(`Redis ${name} error: ${error.message}`, error.stack);
    });

    client.on('close', () => {
      this.logger.warn(`Redis ${name} connection closed`);
    });

    client.on('reconnecting', () => {
      this.logger.log(`Redis ${name} reconnecting...`);
    });
  }

  private getRedisConfig(): RedisOptions {
    return {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: false,
      connectTimeout: 10000,
      lazyConnect: false, // Auto-connect on instantiation
    };
  }

  /**
   * Get Redis client for general operations
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Get subscriber client for pub/sub
   */
  getSubscriber(): Redis {
    return this.subscriber;
  }

  /**
   * Get publisher client for pub/sub
   */
  getPublisher(): Redis {
    return this.publisher;
  }

  /**
   * Set key-value with optional expiration
   */
  async set(key: string, value: string | number | Buffer, ttl?: number): Promise<'OK' | null> {
    if (ttl) {
      return this.client.setex(key, ttl, value);
    }
    return this.client.set(key, value);
  }

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Delete key(s)
   */
  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  /**
   * Set expiration for key
   */
  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  /**
   * Get TTL for key
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Increment value
   */
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  /**
   * Increment by value
   */
  async incrby(key: string, increment: number): Promise<number> {
    return this.client.incrby(key, increment);
  }

  /**
   * Decrement value
   */
  async decr(key: string): Promise<number> {
    return this.client.decr(key);
  }

  /**
   * Decrement by value
   */
  async decrby(key: string, decrement: number): Promise<number> {
    return this.client.decrby(key, decrement);
  }

  /**
   * Set hash field
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  /**
   * Get hash field
   */
  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  /**
   * Get all hash fields
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  /**
   * Delete hash field(s)
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  /**
   * Set multiple hash fields
   */
  async hmset(key: string, data: Record<string, string | number>): Promise<'OK' | number> {
    return this.client.hmset(key, data);
  }

  /**
   * Add member to set
   */
  async sadd(key: string, ...members: (string | number)[]): Promise<number> {
    return this.client.sadd(key, ...members);
  }

  /**
   * Remove member from set
   */
  async srem(key: string, ...members: (string | number)[]): Promise<number> {
    return this.client.srem(key, ...members);
  }

  /**
   * Check if member exists in set
   */
  async sismember(key: string, member: string | number): Promise<number> {
    return this.client.sismember(key, member);
  }

  /**
   * Get all members of set
   */
  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: string): Promise<number> {
    return this.publisher.publish(channel, message);
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, msg) => {
      if (ch === channel) {
        callback(msg);
      }
    });
  }

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  /**
   * Get keys by pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  /**
   * Scan keys by pattern (recommended for production)
   */
  async scan(cursor: string, pattern?: string, count?: number): Promise<[string, string[]]> {
    if (pattern && count) {
      return this.client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    } else if (pattern) {
      return this.client.scan(cursor, 'MATCH', pattern);
    } else if (count) {
      return this.client.scan(cursor, 'COUNT', count);
    }
    return this.client.scan(cursor);
  }

  /**
   * Flush database (use with caution)
   */
  async flushdb(): Promise<'OK'> {
    return this.client.flushdb();
  }

  /**
   * Ping Redis server
   */
  async ping(): Promise<'PONG'> {
    return this.client.ping();
  }
}
