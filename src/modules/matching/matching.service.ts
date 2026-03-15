import { Injectable, Logger } from '@nestjs/common';
import { OrderBookService } from './orderbook';
import { MatchingRepository } from './repositories';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';
import { MarketOrderStrategy } from './strategies/market-order.strategy';
import {
  OrderBookOrder,
  MatchingContext,
  TradeExecutionResult,
  TradeExecutor,
} from './interfaces';
import { RedisService } from '@/common/services';

const LOCK_PREFIX = 'matching:lock:';
const LOCK_TTL_MS = 10000;

/**
 * Matching Engine Service
 * Orchestrates order matching (price-time priority), trade execution (atomic DB), lock (Redis), observer (trade events).
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  private readonly observers: Array<(trade: TradeExecutionResult) => void> = [];

  constructor(
    private readonly orderBookService: OrderBookService,
    private readonly matchingRepository: MatchingRepository,
    private readonly priceTimeStrategy: PriceTimePriorityStrategy,
    private readonly marketOrderStrategy: MarketOrderStrategy,
    private readonly redisService: RedisService,
  ) {}

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
    const lockKey = `${LOCK_PREFIX}${pairId}`;
    const lockValue = `${Date.now()}-${Math.random()}`;
    const client = this.redisService.getClient();
    const acquired = await client.set(lockKey, lockValue, 'PX', LOCK_TTL_MS, 'NX');
    if (acquired !== 'OK') {
      this.logger.warn(`Matching lock not acquired for pair ${pairId}, skipping`);
      return [];
    }

    try {
      await this.ensureBookLoaded(pairId);

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

  /** Load OPEN/PARTIAL orders from DB into in-memory book (Database Procedure Pattern). */
  async ensureBookLoaded(pairId: string): Promise<void> {
    if (this.orderBookService.size(pairId) > 0) return;
    const [buys, sells] = await Promise.all([
      this.matchingRepository.getOpenOrdersForPair(pairId, 'BUY'),
      this.matchingRepository.getOpenOrdersForPair(pairId, 'SELL'),
    ]);
    this.orderBookService.loadOrders(pairId, [...buys, ...sells]);
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
