import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { RedisService } from '@/common/services';

const HALT_KEY_PREFIX = 'circuit:halt:';
const PRICE_WINDOW_KEY_PREFIX = 'circuit:price:';

export interface CircuitBreakerConfig {
  /** Maximum allowed price change as decimal fraction (e.g. '0.05' = 5%). */
  thresholdPct: string;
  /** Rolling window in seconds for price comparison. */
  windowSec: number;
  /** How long to halt trading in seconds. */
  haltDurationSec: number;
}

/**
 * Circuit Breaker Service
 * Detects extreme price moves per trading pair and halts matching when triggered.
 * State is stored in Redis so it works across multiple instances.
 *
 * Usage:
 * 1. Call recordPriceAndCheck() after each trade fill to track price history.
 * 2. Call isHalted() in MatchingService.runMatch() before executing trades.
 * 3. Admin calls resumeTrading() to manually clear a halt.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Returns true when the pair is currently halted.
   */
  async isHalted(pairId: string): Promise<boolean> {
    const client = this.redisService.getClient();
    const value = await client.get(`${HALT_KEY_PREFIX}${pairId}`);
    return value !== null;
  }

  /**
   * Records the latest trade price for a pair and checks if the move within the window exceeds the threshold.
   * Returns true and writes a halt key if the circuit breaker fires; false otherwise.
   */
  async recordPriceAndCheck(
    pairId: string,
    price: string,
    config: CircuitBreakerConfig,
  ): Promise<boolean> {
    const client = this.redisService.getClient();
    const priceKey = `${PRICE_WINDOW_KEY_PREFIX}${pairId}`;

    // Fetch the reference price recorded at the start of the window.
    const referenceRaw = await client.get(priceKey);

    if (referenceRaw === null) {
      // First price in this window — store and start the TTL.
      await client.set(priceKey, price, 'EX', config.windowSec);
      return false;
    }

    const referencePrice = new Decimal(referenceRaw);
    const currentPrice = new Decimal(price);
    const threshold = new Decimal(config.thresholdPct);

    const changeAbs = currentPrice.minus(referencePrice).abs();
    const changePct = changeAbs.div(referencePrice);

    if (changePct.gte(threshold)) {
      await client.set(
        `${HALT_KEY_PREFIX}${pairId}`,
        JSON.stringify({
          triggeredAt: new Date().toISOString(),
          referencePrice: referenceRaw,
          currentPrice: price,
        }),
        'EX',
        config.haltDurationSec,
      );
      this.logger.warn(
        `Circuit breaker TRIGGERED for pair ${pairId}: price moved ${changePct.mul(100).toFixed(2)}% (ref=${referenceRaw} current=${price})`,
      );
      return true;
    }

    return false;
  }

  /**
   * Admin: manually clear a halt for a pair (resume trading).
   */
  async resumeTrading(pairId: string): Promise<void> {
    const client = this.redisService.getClient();
    await client.del(`${HALT_KEY_PREFIX}${pairId}`);
    this.logger.log(`Circuit breaker RESET for pair ${pairId} by admin`);
  }
}
