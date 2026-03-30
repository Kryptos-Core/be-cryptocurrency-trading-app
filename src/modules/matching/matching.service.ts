import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

const LOCK_PREFIX = 'matching:lock:';
const LOCK_TTL_MS = 10000;
/** Retry NX lock to reduce skipped matches under brief contention. */
const LOCK_RETRY_ATTEMPTS = 15;
const LOCK_RETRY_DELAY_MS = 20;
/** Safety cap for admin reconcile loops (each round may run N match attempts). */
const RECONCILE_MAX_ROUNDS = 400;

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
    const lockKey = `${LOCK_PREFIX}${pairId.trim()}`;
    const lockValue = `${Date.now()}-${Math.random()}`;
    const client = this.redisService.getClient();

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
        const takerFee = (parseFloat(fillAmount) * parseFloat(price) * parseFloat(takerFeeRate)).toFixed(18);
        const makerFee = (parseFloat(fillAmount) * parseFloat(price) * parseFloat(makerFeeRate)).toFixed(18);
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

      const takerRemaining =
        parseFloat(takerOrder.remaining) -
        results.reduce((sum, r) => sum + parseFloat(r.amount), 0);
      if (
        takerRemaining > 0 &&
        ['OPEN', 'PARTIAL'].includes(takerOrder.status) &&
        (takerOrder.time_in_force ?? 'GTC').toUpperCase() === 'GTC'
      ) {
        this.orderBookService.addOrder({
          ...takerOrder,
          remaining: String(takerRemaining),
          filled_amount: String(
            parseFloat(takerOrder.filled_amount) +
              results.reduce((s, r) => s + parseFloat(r.amount), 0),
          ),
        });
      }

      return results;
    } finally {
      await this.redisService.del(lockKey);
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

    const takerPrice = takerOrder.price ? parseFloat(takerOrder.price) : null;
    let remaining = parseFloat(takerOrder.remaining);

    for (const maker of makers) {
      if (remaining <= 0) break;

      const makerRemaining = parseFloat(maker.remaining);
      if (!Number.isFinite(makerRemaining) || makerRemaining <= 0) continue;

      if (takerOrder.type === 'LIMIT') {
        const makerPrice = maker.price ? parseFloat(maker.price) : NaN;
        if (!Number.isFinite(makerPrice)) continue;

        const priceCrosses =
          takerOrder.side === 'BUY'
            ? (takerPrice === null || makerPrice <= takerPrice)
            : (takerPrice === null || makerPrice >= takerPrice);
        if (!priceCrosses) continue;
      }

      remaining -= Math.min(remaining, makerRemaining);
    }

    return remaining <= 0;
  }

  /**
   * Rebuild in-memory book from DB every match (authoritative).
   * Excludes the current taker so it only appears as context, not as a resting duplicate on its side.
   */
  private async refreshOrderBookFromDbExcludingTaker(
    pairId: string,
    takerOrderId: string,
  ): Promise<void> {
    const [buys, sells] = await Promise.all([
      this.matchingRepository.getOpenOrdersForPair(pairId, 'BUY'),
      this.matchingRepository.getOpenOrdersForPair(pairId, 'SELL'),
    ]);
    const merged = [...buys, ...sells].filter((o) => o.order_id !== takerOrderId);
    this.orderBookService.loadOrders(pairId, merged);
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
