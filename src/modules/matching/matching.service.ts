import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { OrderBookService } from './orderbook';
import { MatchingRepository } from './repositories';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';
import { MarketOrderStrategy } from './strategies/market-order.strategy';
import {
  OrderBookOrder,
  MatchingContext,
  MatchingReconcileResult,
  TradeExecutionResult,
  TradeExecutor,
} from './interfaces';
import { AuditTradeVisitor, MetricsTradeVisitor } from './visitors';
import { RedisService } from '@/common/services';
import { CircuitBreakerService } from './circuit-breaker.service';
import { toBaseUnits, fromBaseUnits, DEFAULT_SCALE } from './utils';

const LOCK_PREFIX = 'matching:lock:';
const LOCK_TTL_MS = 10000;
/** Retry NX lock to reduce skipped matches under brief contention. */
const LOCK_RETRY_ATTEMPTS = 15;
const LOCK_RETRY_DELAY_MS = 20;
/** Safety cap for admin reconcile loops (each round may run N match attempts). */
const RECONCILE_MAX_ROUNDS = 400;

/**
 * Default circuit-breaker config: halt when price moves ≥5% within a 60-second window.
 * Halt lasts 300 seconds (5 min) — admin can clear early via CircuitBreakerService.resumeTrading().
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  thresholdPct: '0.05',
  windowSec: 60,
  haltDurationSec: 300,
} as const;

/**
 * Lua script: atomically delete lock key only if its value matches the caller's value.
 * Returns 1 if deleted, 0 if key doesn't exist or value mismatch.
 * Prevents a process from deleting a lock acquired by another process after TTL expiry.
 */
const RELEASE_LOCK_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

/**
 * Matching Engine Service
 * Orchestrates order matching (price-time priority), trade execution (atomic DB), lock (Redis), observer (trade events).
 * Visitor Pattern: AuditTradeVisitor + MetricsTradeVisitor registered on init as trade observers.
 */
@Injectable()
export class MatchingService implements OnModuleInit {
  private readonly logger = new Logger(MatchingService.name);
  private readonly observers: Array<(trade: TradeExecutionResult) => void> = [];

  constructor(
    private readonly orderBookService: OrderBookService,
    private readonly matchingRepository: MatchingRepository,
    private readonly priceTimeStrategy: PriceTimePriorityStrategy,
    private readonly marketOrderStrategy: MarketOrderStrategy,
    private readonly redisService: RedisService,
    private readonly auditVisitor: AuditTradeVisitor,
    private readonly metricsVisitor: MetricsTradeVisitor,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  onModuleInit(): void {
    this.onTradeExecuted((t) => this.auditVisitor.visit(t));
    this.onTradeExecuted((t) => this.metricsVisitor.visit(t));
  }

  /**
   * Run matching for one taker order. Lock Pattern: Redis lock per pair.
   */
  async runMatch(params: {
    takerOrder: OrderBookOrder;
    pairId: string;
    feeCurrencyId: string;
    makerFeeRate: string;
    takerFeeRate: string;
  }): Promise<TradeExecutionResult[]> {
    const { takerOrder, pairId, feeCurrencyId, makerFeeRate, takerFeeRate } = params;

    // Validate fee rates early to avoid silent errors in BigInt arithmetic.
    try {
      toBaseUnits(makerFeeRate, DEFAULT_SCALE);
      toBaseUnits(takerFeeRate, DEFAULT_SCALE);
    } catch {
      throw new Error(`Invalid fee rates: maker=${makerFeeRate}, taker=${takerFeeRate}`);
    }

    const lockKey = `${LOCK_PREFIX}${pairId.trim()}`;
    const lockValue = randomBytes(16).toString('hex');
    const client = this.redisService.getClient();

    // Circuit breaker: halt trading for this pair when extreme price move detected.
    if (await this.circuitBreaker.isHalted(pairId)) {
      this.logger.warn(`Matching halted by circuit breaker for pair ${pairId}`);
      return [];
    }

    let acquired: string | null = null;
    for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt++) {
      acquired = await client.set(lockKey, lockValue, 'PX', LOCK_TTL_MS, 'NX');
      if (acquired === 'OK') break;
      if (attempt < LOCK_RETRY_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, LOCK_RETRY_DELAY_MS));
      }
    }
    if (acquired !== 'OK') {
      this.logger.warn(
        `Matching lock not acquired for pair ${pairId} after ${LOCK_RETRY_ATTEMPTS} attempts, skipping`,
      );
      return [];
    }

    try {
      await this.refreshOrderBookFromDbExcludingTaker(pairId, takerOrder.order_id);

      const tif = (takerOrder.time_in_force ?? 'GTC').toUpperCase();
      if (tif === 'FOK') {
        const canFullyFill = await this.canFullyFillOrder({ pairId, takerOrder });
        if (!canFullyFill) {
          this.logger.log(
            `FOK order ${takerOrder.order_id} cannot be fully filled now; skip execution`,
          );
          return [];
        }
      }

      const context: MatchingContext = {
        pairId,
        takerOrder,
        feeCurrencyId,
        makerFeeRate,
        takerFeeRate,
      };

      const executeTrade: TradeExecutor = async (makerOrder, fillAmount, price) => {
        // Fee = fillAmount * price * feeRate (all in base units, divide by SCALE^2 for correct decimal)
        const SCALE = 10n ** BigInt(DEFAULT_SCALE);
        const fillBu = toBaseUnits(fillAmount, DEFAULT_SCALE);
        const priceBu = toBaseUnits(price, DEFAULT_SCALE);
        const takerRateBu = toBaseUnits(takerFeeRate, DEFAULT_SCALE);
        const makerRateBu = toBaseUnits(makerFeeRate, DEFAULT_SCALE);
        const takerFee = fromBaseUnits((fillBu * priceBu * takerRateBu) / (SCALE * SCALE), DEFAULT_SCALE);
        const makerFee = fromBaseUnits((fillBu * priceBu * makerRateBu) / (SCALE * SCALE), DEFAULT_SCALE);
        const result = await this.matchingRepository.executeTrade({
          pairId,
          makerOrderId: makerOrder.order_id,
          takerOrderId: takerOrder.order_id,
          price,
          amount: fillAmount,
          feeCurrencyId,
          takerFee,
          makerFee,
        });
        if (result.error_code) {
          this.logger.error(`Trade execute failed: ${result.error_code} ${result.error_message}`);
          return null;
        }
        const execResult: TradeExecutionResult = {
          trade_id: result.trade_id!,
          pair_id: pairId,
          maker_order_id: makerOrder.order_id,
          taker_order_id: takerOrder.order_id,
          price,
          amount: fillAmount,
          taker_fee: takerFee,
          maker_fee: makerFee,
          fee_currency_id: feeCurrencyId,
          created_at: new Date(),
        };
        this.notifyTradeExecuted(execResult);
        // Record price for circuit breaker monitoring (fire-and-forget; never throws into matching flow).
        this.circuitBreaker.recordPriceAndCheck(pairId, price, DEFAULT_CIRCUIT_BREAKER_CONFIG).catch(
          (e) => this.logger.warn(`Circuit breaker recordPrice error: ${e instanceof Error ? e.message : String(e)}`),
        );
        return execResult;
      };

      const orderBookAdapter = {
        peekBestMaker: (p: string, side: 'BUY' | 'SELL') =>
          this.orderBookService.peekBestMaker(p, side),
        popBestMaker: (p: string, side: 'BUY' | 'SELL') =>
          this.orderBookService.popBestMaker(p, side),
        addOrder: (o: OrderBookOrder) => this.orderBookService.addOrder(o),
      };

      const strategy =
        takerOrder.type === 'MARKET' ? this.marketOrderStrategy : this.priceTimeStrategy;
      const results = await strategy.match(context, orderBookAdapter, executeTrade);

      const totalFilledBu = results.reduce(
        (sum, r) => sum + toBaseUnits(r.amount, DEFAULT_SCALE),
        0n,
      );
      const takerRemainingBu = toBaseUnits(takerOrder.remaining, DEFAULT_SCALE) - totalFilledBu;
      if (
        takerRemainingBu > 0n &&
        ['OPEN', 'PARTIAL'].includes(takerOrder.status) &&
        (takerOrder.time_in_force ?? 'GTC').toUpperCase() === 'GTC'
      ) {
        const takerFilledBu = toBaseUnits(takerOrder.filled_amount, DEFAULT_SCALE) + totalFilledBu;
        this.orderBookService.addOrder({
          ...takerOrder,
          remaining: fromBaseUnits(takerRemainingBu, DEFAULT_SCALE),
          filled_amount: fromBaseUnits(takerFilledBu, DEFAULT_SCALE),
        });
      }

      return results;
    } finally {
      const released = await client.eval(RELEASE_LOCK_LUA, 1, lockKey, lockValue);
      if (released === 0) {
        this.logger.warn(
          `Lock ${lockKey} was already expired or taken by another process; skipped delete`,
        );
      }
    }
  }

  private async canFullyFillOrder(params: {
    pairId: string;
    takerOrder: OrderBookOrder;
  }): Promise<boolean> {
    const { pairId, takerOrder } = params;
    const oppositeSide = takerOrder.side === 'BUY' ? 'SELL' : 'BUY';
    const makers = await this.matchingRepository.getOpenOrdersForPair(
      pairId,
      oppositeSide,
    );

    const takerPriceBu = takerOrder.price ? toBaseUnits(takerOrder.price, DEFAULT_SCALE) : null;
    let remainingBu = toBaseUnits(takerOrder.remaining, DEFAULT_SCALE);

    for (const maker of makers) {
      if (remainingBu <= 0n) break;

      // Self-Trade Prevention: exclude makers owned by the same user (mirrors matching strategy).
      if (maker.user_id && takerOrder.user_id && maker.user_id === takerOrder.user_id) continue;

      if (!maker.remaining) continue;
      let makerRemainingBu: bigint;
      try {
        makerRemainingBu = toBaseUnits(maker.remaining, DEFAULT_SCALE);
      } catch {
        continue;
      }
      if (makerRemainingBu <= 0n) continue;

      if (takerOrder.type === 'LIMIT') {
        if (!maker.price) continue;
        let makerPriceBu: bigint;
        try {
          makerPriceBu = toBaseUnits(maker.price, DEFAULT_SCALE);
        } catch {
          continue;
        }

        const priceCrosses =
          takerOrder.side === 'BUY'
            ? (takerPriceBu === null || makerPriceBu <= takerPriceBu)
            : (takerPriceBu === null || makerPriceBu >= takerPriceBu);
        if (!priceCrosses) continue;
      }

      const fillBu = remainingBu < makerRemainingBu ? remainingBu : makerRemainingBu;
      remainingBu -= fillBu;
    }

    return remainingBu <= 0n;
  }

  /**
   * Seed order book from DB on first match for a pair; subsequent matches use the in-memory
   * book incrementally (add/remove updates keep it consistent with DB state).
   * Taker is excluded from the book so it only acts as context, not a resting duplicate.
   */
  private async refreshOrderBookFromDbExcludingTaker(
    pairId: string,
    takerOrderId: string,
  ): Promise<void> {
    if (this.orderBookService.isLoaded(pairId)) {
      // Incremental path: book is already seeded; just ensure the taker is not in it as a resting order.
      this.orderBookService.removeOrder(pairId, takerOrderId, 'BUY');
      this.orderBookService.removeOrder(pairId, takerOrderId, 'SELL');
      return;
    }

    const [buys, sells] = await Promise.all([
      this.matchingRepository.getOpenOrdersForPair(pairId, 'BUY'),
      this.matchingRepository.getOpenOrdersForPair(pairId, 'SELL'),
    ]);
    const merged = [...buys, ...sells].filter((o) => o.order_id !== takerOrderId);
    this.orderBookService.loadOrders(pairId, merged);
    this.orderBookService.markLoaded(pairId);
  }

  /** Remove a cancelled/filled order from the in-memory book (keeps book aligned with DB). */
  removeOrderFromBook(pairId: string, orderId: string, side: 'BUY' | 'SELL'): boolean {
    return this.orderBookService.removeOrder(pairId, orderId, side);
  }

  /**
   * Admin / operations: manually drive matching for every OPEN/PARTIAL order on a pair until
   * no more trades execute (or safety cap). Use when book/DB drifted or matches were skipped.
   * Each iteration calls [runMatch] for one taker (oldest first among candidates that round).
   */
  async reconcileOpenOrdersForPair(params: {
    pairId: string;
    feeCurrencyId: string;
    makerFeeRate: string;
    takerFeeRate: string;
  }): Promise<MatchingReconcileResult> {
    const { pairId, feeCurrencyId, makerFeeRate, takerFeeRate } = params;
    let tradesExecuted = 0;
    let matchRuns = 0;
    let stoppedReason: MatchingReconcileResult['stoppedReason'] = 'max_rounds';

    this.logger.log(`Matching reconcile started for pair ${pairId}`);

    for (let round = 0; round < RECONCILE_MAX_ROUNDS; round++) {
      const [buys, sells] = await Promise.all([
        this.matchingRepository.getOpenOrdersForPair(pairId, 'BUY'),
        this.matchingRepository.getOpenOrdersForPair(pairId, 'SELL'),
      ]);
      const openCount = buys.length + sells.length;
      if (openCount === 0) {
        stoppedReason = 'all_matched';
        break;
      }

      const sorted = [...buys, ...sells].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      let progressed = false;
      for (const taker of sorted) {
        matchRuns += 1;
        const results = await this.runMatch({
          takerOrder: taker,
          pairId,
          feeCurrencyId,
          makerFeeRate,
          takerFeeRate,
        });
        if (results.length > 0) {
          tradesExecuted += results.length;
          progressed = true;
          break;
        }
      }

      if (!progressed) {
        stoppedReason = 'no_progress';
        break;
      }
    }

    const [buysFinal, sellsFinal] = await Promise.all([
      this.matchingRepository.getOpenOrdersForPair(pairId, 'BUY'),
      this.matchingRepository.getOpenOrdersForPair(pairId, 'SELL'),
    ]);
    const openOrdersRemaining = buysFinal.length + sellsFinal.length;

    this.logger.log(
      `Matching reconcile finished pair ${pairId}: trades=${tradesExecuted}, runs=${matchRuns}, openRemaining=${openOrdersRemaining}, reason=${stoppedReason}`,
    );

    return {
      pairId,
      tradesExecuted,
      matchRuns,
      openOrdersRemaining,
      stoppedReason,
    };
  }

  /** Observer Pattern: subscribe to trade executed. */
  onTradeExecuted(callback: (trade: TradeExecutionResult) => void): void {
    this.observers.push(callback);
  }

  private notifyTradeExecuted(trade: TradeExecutionResult): void {
    this.observers.forEach((cb) => {
      try {
        cb(trade);
      } catch (e) {
        this.logger.warn('Trade observer error', e);
      }
    });
  }
}
