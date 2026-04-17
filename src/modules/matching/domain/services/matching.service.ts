import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/common/services';
import { MatchingLockContentionError } from '../../errors/matching-lock-contention.error';
import { AuditTradeVisitor, MetricsTradeVisitor } from '../../infrastructure/observers';
import type {
  MatchingContext,
  MatchingReconcileResult,
  OrderBookOrder,
  TradeExecutionResult,
  TradeExecutor,
} from '../../interfaces';
import { DEFAULT_SCALE, fromBaseUnits, toBaseUnits } from '../../utils';
import { marketOrderCanFullyFillRemaining } from '../../utils/market-fok-fill.util';
import { MATCHING_REPOSITORY, type MatchingRepositoryPort } from '../ports';
import { CircuitBreakerService } from './circuit-breaker.service';
import { OrderBookService } from './orderbook';
import { MarketOrderStrategy } from './strategies/market-order.strategy';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';

const LOCK_PREFIX = 'matching:lock:';
const LOCK_TTL_MS = 10000;
const LOCK_RETRY_ATTEMPTS = 15;
const LOCK_RETRY_DELAY_MS = 20;
const RECONCILE_MAX_ROUNDS = 400;

const DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  thresholdPct: '0.05',
  windowSec: 60,
  haltDurationSec: 300,
} as const;

const RELEASE_LOCK_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

@Injectable()
export class MatchingService implements OnModuleInit {
  private readonly logger = new Logger(MatchingService.name);
  private readonly observers: Array<(trade: TradeExecutionResult) => void> = [];

  constructor(
    private readonly orderBookService: OrderBookService,
    @Inject(MATCHING_REPOSITORY)
    private readonly matchingRepository: MatchingRepositoryPort,
    private readonly priceTimeStrategy: PriceTimePriorityStrategy,
    private readonly marketOrderStrategy: MarketOrderStrategy,
    private readonly redisService: RedisService,
    private readonly auditVisitor: AuditTradeVisitor,
    private readonly metricsVisitor: MetricsTradeVisitor,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.onTradeExecuted((t) => this.auditVisitor.visit(t));
    this.onTradeExecuted((t) => this.metricsVisitor.visit(t));
  }

  async runMatch(params: {
    takerOrder: OrderBookOrder;
    pairId: string;
    feeCurrencyId: string;
    makerFeeRate: string;
    takerFeeRate: string;
    slippageTolerance?: string;
  }): Promise<TradeExecutionResult[]> {
    const { takerOrder, pairId, feeCurrencyId, makerFeeRate, takerFeeRate, slippageTolerance } =
      params;

    try {
      toBaseUnits(makerFeeRate, DEFAULT_SCALE);
      toBaseUnits(takerFeeRate, DEFAULT_SCALE);
    } catch {
      throw new Error(`Invalid fee rates: maker=${makerFeeRate}, taker=${takerFeeRate}`);
    }

    const lockKey = `${LOCK_PREFIX}${pairId.trim()}`;
    const lockValue = randomBytes(16).toString('hex');
    const client = this.redisService.getClient();

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
        `Matching lock contention pair=${pairId} order=${takerOrder.order_id} reason=lock_exhausted attempts=${LOCK_RETRY_ATTEMPTS}`,
      );
      throw new MatchingLockContentionError(pairId.trim(), takerOrder.order_id);
    }

    try {
      await this.refreshOrderBookFromDbExcludingTaker(pairId, takerOrder.order_id);

      const tif = (takerOrder.time_in_force ?? 'GTC').toUpperCase();
      const effectiveSlippage =
        slippageTolerance?.trim() || takerOrder.slippage_tolerance?.trim() || undefined;
      if (tif === 'FOK') {
        const canFullyFill = await this.canFullyFillOrder({
          pairId,
          takerOrder,
          fokSlippageTolerance: effectiveSlippage,
        });
        if (!canFullyFill) {
          this.logger.log(
            `FOK order ${takerOrder.order_id} cannot be fully filled now; skip execution`,
          );
          try {
            await this.matchingRepository.cancelIocRemainder(
              takerOrder.order_id,
              takerOrder.user_id,
            );
          } catch (e) {
            this.logger.warn(
              `FOK cancel failed for order ${takerOrder.order_id}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
          return [];
        }
      }

      const context: MatchingContext = {
        pairId,
        takerOrder,
        feeCurrencyId,
        makerFeeRate,
        takerFeeRate,
        ...(effectiveSlippage !== undefined && { slippageTolerance: effectiveSlippage }),
      };

      const executeTrade: TradeExecutor = async (makerOrder, fillAmount, price) => {
        const SCALE = 10n ** BigInt(DEFAULT_SCALE);
        const fillBu = toBaseUnits(fillAmount, DEFAULT_SCALE);
        const priceBu = toBaseUnits(price, DEFAULT_SCALE);
        const takerRateBu = toBaseUnits(takerFeeRate, DEFAULT_SCALE);
        const makerRateBu = toBaseUnits(makerFeeRate, DEFAULT_SCALE);
        const takerFee = fromBaseUnits(
          (fillBu * priceBu * takerRateBu) / (SCALE * SCALE),
          DEFAULT_SCALE,
        );
        const makerFee = fromBaseUnits(
          (fillBu * priceBu * makerRateBu) / (SCALE * SCALE),
          DEFAULT_SCALE,
        );
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
        this.circuitBreaker
          .recordPriceAndCheck(pairId, price, DEFAULT_CIRCUIT_BREAKER_CONFIG)
          .catch((e) =>
            this.logger.warn(
              `Circuit breaker recordPrice error: ${e instanceof Error ? e.message : String(e)}`,
            ),
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

      if (tif === 'IOC' && takerRemainingBu > 0n) {
        try {
          await this.matchingRepository.cancelIocRemainder(takerOrder.order_id, takerOrder.user_id);
        } catch (e) {
          this.logger.warn(
            `IOC remainder cancel failed for order ${takerOrder.order_id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
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
    fokSlippageTolerance?: string;
  }): Promise<boolean> {
    const { pairId, takerOrder, fokSlippageTolerance } = params;
    const oppositeSide = takerOrder.side === 'BUY' ? 'SELL' : 'BUY';
    const makers = this.orderBookService.getOrders(pairId, oppositeSide);

    if (
      takerOrder.type === 'MARKET' &&
      fokSlippageTolerance &&
      toBaseUnits(fokSlippageTolerance, DEFAULT_SCALE) > 0n
    ) {
      return marketOrderCanFullyFillRemaining(makers, takerOrder, fokSlippageTolerance);
    }

    const takerPriceBu = takerOrder.price ? toBaseUnits(takerOrder.price, DEFAULT_SCALE) : null;
    let remainingBu = toBaseUnits(takerOrder.remaining, DEFAULT_SCALE);

    for (const maker of makers) {
      if (remainingBu <= 0n) break;
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
            ? takerPriceBu === null || makerPriceBu <= takerPriceBu
            : takerPriceBu === null || makerPriceBu >= takerPriceBu;
        if (!priceCrosses) continue;
      }

      const fillBu = remainingBu < makerRemainingBu ? remainingBu : makerRemainingBu;
      remainingBu -= fillBu;
    }

    return remainingBu <= 0n;
  }

  private matchingBookFullRefreshEnabled(): boolean {
    const v = (
      this.configService.get<string>('MATCHING_BOOK_FULL_REFRESH') ??
      process.env.MATCHING_BOOK_FULL_REFRESH ??
      ''
    )
      .trim()
      .toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  private async refreshOrderBookFromDbExcludingTaker(
    pairId: string,
    takerOrderId: string,
  ): Promise<void> {
    const fullRefresh = this.matchingBookFullRefreshEnabled();
    if (!fullRefresh && this.orderBookService.isLoaded(pairId)) {
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

  removeOrderFromBook(pairId: string, orderId: string, side: 'BUY' | 'SELL'): boolean {
    return this.orderBookService.removeOrder(pairId, orderId, side);
  }

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
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      let progressed = false;
      for (const taker of sorted) {
        matchRuns += 1;
        let results: TradeExecutionResult[] = [];
        try {
          results = await this.runMatch({
            takerOrder: taker,
            pairId,
            feeCurrencyId,
            makerFeeRate,
            takerFeeRate,
          });
        } catch (e) {
          if (e instanceof MatchingLockContentionError) {
            this.logger.warn(
              `Reconcile: lock contention for pair ${pairId} order ${taker.order_id}, will retry next round`,
            );
            continue;
          }
          throw e;
        }
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
