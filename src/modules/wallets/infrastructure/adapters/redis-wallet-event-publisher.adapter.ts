import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/common/services/redis.service';
import type { WalletEventPublisherPort } from '@/modules/wallets/domain/ports';
import { WALLET_BALANCE_EVENTS_CHANNEL } from '@/modules/wallets/constants';

/**
 * Infrastructure Adapter: Redis Wallet Event Publisher
 * Publishes wallet balance change events to Redis Pub/Sub.
 */
@Injectable()
export class RedisWalletEventPublisher implements WalletEventPublisherPort {
  private readonly logger = new Logger(RedisWalletEventPublisher.name);

  constructor(private readonly redisService: RedisService) {}

  async publishBalanceChange(event: {
    userId: string;
    currencyId: string;
    symbol: string;
    available: string;
    frozen: string;
    total: string;
  }): Promise<void> {
    const payload = {
      ...event,
      updatedAt: Date.now(),
    };
    try {
      await this.redisService.publish(WALLET_BALANCE_EVENTS_CHANNEL, JSON.stringify(payload));
      this.logger.debug(`Published balance change: user=${event.userId}, currency=${event.symbol}`);
    } catch (error) {
      this.logger.error(`Failed to publish balance change event: ${error}`);
    }
  }
}
