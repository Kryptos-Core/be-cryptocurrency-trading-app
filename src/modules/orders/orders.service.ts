import { Injectable, Logger } from '@nestjs/common';
import { BusinessException, ForbiddenException, NotFoundException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import { calcSkip } from '@/common/utils/pagination.util';
import { newUuid } from '@/common/utils/uuid.util';
import { Order } from '@/entities/order.entity';
import { MarketRepository } from '@/modules/markets/repositories';
import type { MatchingReconcileResult } from '@/modules/matching/interfaces/matching.interface';
import { MatchingService } from '@/modules/matching/matching.service';
import { MatchingQueueService } from '@/modules/matching/matching-queue.service';
import { WalletRepository } from '@/modules/wallets/repositories/wallet.repository';
import type { CancelOrderCommand } from './commands/cancel-order.command';
import type { CreateOrderCommand } from './commands/create-order.command';
import type { CancelBatchOrderDto, CreateBatchOrderDto } from './dto';
import { OrderRepository } from './repositories';
import { canCancelOrder } from './states';
import { OrderValidationStrategy } from './strategies';
import { computeMarketBuyMaxQuoteReserve } from './utils/market-buy-reserve.util';

const IDEMPOTENCY_CACHE_PREFIX = 'order:idempotency:';
const IDEMPOTENCY_TTL_SEC = 86400; // 24h
const MAX_BATCH_ORDERS = 20;

/**
 * Orders Service
 * Service Layer Pattern: Orchestrates order creation, cancellation, and queries.
 * Idempotency Pattern: Redis + DB for duplicate order prevention.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly marketRepository: MarketRepository,
    private readonly walletRepository: WalletRepository,
    private readonly cacheService: CacheService,
    private readonly validationStrategy: OrderValidationStrategy,
    private readonly matchingService: MatchingService,
    private readonly matchingQueueService: MatchingQueueService,
  ) {}

  async create(command: CreateOrderCommand): Promise<Order> {
    const { userId, dto } = command;
    const cacheKey = `${IDEMPOTENCY_CACHE_PREFIX}${userId}:${dto.idempotencyKey}`;

    const cached = await this.cacheService.get<Order>(cacheKey);
    if (cached) {
      return this.mapToOrder(cached);
    }

    const existing = await this.orderRepository.findByUserIdempotency(userId, dto.idempotencyKey);
    if (existing) {
      await this.cacheService.set(cacheKey, this.orderToPlain(existing), IDEMPOTENCY_TTL_SEC);
      return existing;
    }

    const pair = await this.marketRepository.findById(dto.pairId);
    if (!pair) {
      throw new NotFoundException('Market pair', dto.pairId);
    }

    const baseCurrencyId = pair.base_currency_id;
    const quoteCurrencyId = pair.quote_currency_id;
    const quoteWallet = await this.walletRepository.findByUserCurrency(userId, quoteCurrencyId);
    const baseWallet = await this.walletRepository.findByUserCurrency(userId, baseCurrencyId);
    const availableQuote = quoteWallet?.available ?? '0';
    const availableBase = baseWallet?.available ?? '0';

    let requiredQuoteForBuy: string | undefined;
    let slippageForDb: string | null = null;
    let marketBuyReservedQuote: string | null = null;

    if (dto.type === 'MARKET' && dto.side === 'BUY') {
      const slip = dto.slippageTolerance?.trim() ?? '';
      if (!slip) {
        throw new BusinessException(
          'slippageTolerance is required for MARKET BUY orders',
          'INVALID_INPUT',
        );
      }
      const bestAsk = await this.orderRepository.findBestLimitSellPrice(dto.pairId);
      if (!bestAsk) {
        throw new BusinessException('No sell-side limit liquidity for this pair', 'NO_LIQUIDITY');
      }
      const maxQuote = computeMarketBuyMaxQuoteReserve(bestAsk, dto.amount, slip);
      requiredQuoteForBuy = maxQuote;
      marketBuyReservedQuote = maxQuote;
      slippageForDb = slip;
    } else if (dto.type === 'MARKET' && dto.slippageTolerance?.trim()) {
      slippageForDb = dto.slippageTolerance.trim();
    }

    this.validationStrategy.validate({
      pairId: dto.pairId,
      side: dto.side,
      type: dto.type,
      amount: dto.amount,
      price: dto.type === 'LIMIT' ? dto.price : undefined,
      timeInForce: dto.timeInForce,
      minOrderAmount: pair.min_order_amount ?? '0.0001',
      availableBalance: dto.side === 'BUY' ? availableQuote : availableBase,
      ...(requiredQuoteForBuy !== undefined ? { requiredQuoteForBuy } : {}),
      amountScale: Number(pair.amount_scale ?? 18),
      priceScale: Number(pair.price_scale ?? 18),
    });

    const price = dto.type === 'LIMIT' ? dto.price! : null;
    const orderId = newUuid();
    const result = await this.orderRepository.createOrderViaProcedure({
      orderId,
      userId,
      pairId: dto.pairId,
      side: dto.side,
      type: dto.type,
      price,
      amount: dto.amount,
      timeInForce: dto.timeInForce ?? 'GTC',
      clientOrderId: dto.clientOrderId ?? null,
      idempotencyKey: dto.idempotencyKey,
      slippageTolerance: slippageForDb,
      marketBuyReservedQuote,
    });

    if (result.error_code) {
      this.throwFromProcedureError(result.error_code, result.error_message ?? undefined);
    }

    if (result.order_id == null) {
      throw new BusinessException('Order creation failed', 'ORDER_CREATE_FAILED');
    }

    const order = await this.orderRepository.findById(result.order_id);
    if (!order) {
      throw new BusinessException('Order created but not found', 'ORDER_NOT_FOUND');
    }

    if (order.status === 'OPEN' || order.status === 'PARTIAL') {
      const remaining = parseFloat(order.amount) - parseFloat(order.filled_amount ?? '0');
      if (remaining > 0) {
        try {
          // Phase 2 #6: Enqueue match job instead of blocking the HTTP thread.
          // IOC/FOK cancellation after fill is handled by the consumer (MatchingProcessor)
          // via a post-process step in MatchingService. For simple cases the queue is fire-and-forget;
          // the client receives order status via WebSocket push.
          await this.matchingQueueService.enqueueMatch({
            takerOrder: this.orderToOrderBookOrder(order),
            pairId: order.pair_id,
            feeCurrencyId: pair.quote_currency_id,
            makerFeeRate: pair.maker_fee_rate ?? '0.001',
            takerFeeRate: pair.taker_fee_rate ?? '0.001',
            ...(order.type === 'MARKET' && order.slippage_tolerance
              ? { slippageTolerance: order.slippage_tolerance }
              : {}),
          });
        } catch (e) {
          this.logger.warn(
            `Matching enqueue failed after order create ${result.order_id}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
          );
        }
      }
    }

    await this.cacheService.set(cacheKey, this.orderToPlain(order), IDEMPOTENCY_TTL_SEC);
    return order;
  }

  async cancel(command: CancelOrderCommand): Promise<Order> {
    const { userId, orderId } = command;
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order', orderId);
    }
    if (order.user_id !== userId) {
      throw new ForbiddenException('You can only cancel your own orders');
    }
    if (!canCancelOrder(order.status as any)) {
      throw new BusinessException(
        `Order cannot be cancelled (status: ${order.status})`,
        'INVALID_STATE',
      );
    }

    const pairId = order.pair_id;
    const side = order.side;

    const result = await this.orderRepository.cancelOrderViaProcedure(orderId, userId);

    if (result.error_code) {
      this.throwFromProcedureError(result.error_code, result.error_message ?? undefined);
    }

    if (!result.cancelled) {
      throw new BusinessException('Cancel failed', 'CANCEL_FAILED');
    }

    if (side === 'BUY' || side === 'SELL') {
      try {
        this.matchingService.removeOrderFromBook(pairId, orderId, side);
      } catch (e) {
        this.logger.warn(
          `Order book remove after cancel ${orderId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const updated = await this.orderRepository.findById(orderId);
    if (!updated) {
      throw new BusinessException('Order cancelled but not found', 'ORDER_NOT_FOUND');
    }
    return updated;
  }

  async createBatch(command: { userId: string; dto: CreateBatchOrderDto }): Promise<{
    created: Order[];
    count: number;
  }> {
    const { userId, dto } = command;
    if (dto.orders.length > MAX_BATCH_ORDERS) {
      throw new BusinessException(
        `Batch size exceeds ${MAX_BATCH_ORDERS} orders`,
        'BATCH_SIZE_EXCEEDED',
      );
    }

    const created = await Promise.all(
      dto.orders.map((orderDto) => this.create({ userId, dto: orderDto })),
    );

    return {
      created,
      count: created.length,
    };
  }

  async cancelBatch(command: { userId: string; dto: CancelBatchOrderDto }): Promise<{
    cancelled: Order[];
    count: number;
  }> {
    const { userId, dto } = command;
    if (dto.orderIds.length > MAX_BATCH_ORDERS) {
      throw new BusinessException(
        `Batch size exceeds ${MAX_BATCH_ORDERS} orders`,
        'BATCH_SIZE_EXCEEDED',
      );
    }

    const cancelled = await Promise.all(
      dto.orderIds.map((orderId) =>
        this.cancel({
          userId,
          orderId,
          idempotencyKey: dto.idempotencyKey,
        }),
      ),
    );

    return {
      cancelled,
      count: cancelled.length,
    };
  }

  async listOpenOrdersForPair(userId: string, pairId: string): Promise<Order[]> {
    return this.orderRepository.findOpenByUserPair(userId, pairId);
  }

  async cancelOpenOrdersForPair(userId: string, pairId: string): Promise<Order[]> {
    const openOrders = await this.orderRepository.findOpenByUserPair(userId, pairId);
    if (openOrders.length === 0) {
      return [];
    }

    const cancelled = await Promise.all(
      openOrders.map((order) =>
        this.cancel({
          userId,
          orderId: order.order_id,
        }),
      ),
    );

    return cancelled;
  }

  async findOne(orderId: string, userId: string): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order', orderId);
    }
    if (order.user_id !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return order;
  }

  getOrderBook(pairId: string, side: 'BUY' | 'SELL', limit: number = 50) {
    return this.orderRepository.getOrderBook(pairId, side, limit);
  }

  async findMyOrders(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    const skip = calcSkip(page, limit);
    const [data, total] = await Promise.all([
      this.orderRepository.findByUser(userId, status ?? null, skip, limit),
      this.orderRepository.countByUser(userId, status ?? null),
    ]);
    return { data, total, page, limit };
  }

  /** Admin: list all orders with filters */
  async findAllForAdmin(params: {
    userId?: string;
    pairId?: string;
    status?: string;
    page: number;
    limit: number;
  }) {
    const skip = calcSkip(params.page, params.limit);
    const { items, total } = await this.orderRepository.findAllForAdmin({
      userId: params.userId,
      pairId: params.pairId,
      status: params.status,
      skip,
      limit: params.limit,
    });
    return {
      data: items.map((o) => this.orderToAdminPlain(o)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  /** Admin: orders for a specific user */
  async findOrdersByUser(userId: string, page: number = 1, limit: number = 20, status?: string) {
    const skip = calcSkip(page, limit);
    const { items, total } = await this.orderRepository.findByUserForAdmin(
      userId,
      skip,
      limit,
      status,
    );
    return {
      data: items.map((o) => this.orderToAdminPlain(o)),
      total,
      page,
      limit,
    };
  }

  /**
   * Admin / vận hành: kích hoạt khớp lại thủ công cho mọi lệnh OPEN/PARTIAL trên một cặp
   * (không cần user đặt lệnh mới). Dùng khi nghi sổ RAM lệch DB hoặc lệnh “kẹt” sau sự cố.
   */
  async reconcileMatchingForPair(pairIdOrSymbol: string): Promise<MatchingReconcileResult> {
    const raw = (pairIdOrSymbol ?? '').trim();
    let pair = await this.marketRepository.findById(raw);
    if (!pair && raw.includes('/')) {
      pair = await this.marketRepository.findBySymbol(raw);
    }
    if (!pair) {
      throw new NotFoundException('Market pair', raw);
    }
    const pairId = String(pair.pair_id);
    return this.matchingService.reconcileOpenOrdersForPair({
      pairId,
      feeCurrencyId: pair.quote_currency_id,
      makerFeeRate: pair.maker_fee_rate ?? '0.001',
      takerFeeRate: pair.taker_fee_rate ?? '0.001',
    });
  }

  private throwFromProcedureError(code: string, message?: string): void {
    const msg = message ?? code;
    switch (code) {
      case 'PAIR_NOT_FOUND':
        throw new NotFoundException('Market pair', '');
      case 'INVALID_PRICE':
      case 'INVALID_AMOUNT':
        throw new BusinessException(msg, code);
      case 'INSUFFICIENT_BALANCE':
        throw new BusinessException(msg, 'INSUFFICIENT_BALANCE');
      case 'NO_LIQUIDITY':
        throw new BusinessException(msg, 'NO_LIQUIDITY');
      case 'INVALID_INPUT':
        throw new BusinessException(msg, 'INVALID_INPUT');
      case 'INVALID_MARKET_BUY_RESERVE':
        throw new BusinessException(msg, 'INVALID_MARKET_BUY_RESERVE');
      case 'ORDER_NOT_FOUND':
        throw new NotFoundException('Order', '');
      case 'FORBIDDEN':
        throw new ForbiddenException(msg);
      case 'INVALID_STATE':
        throw new BusinessException(msg, 'INVALID_STATE');
      default:
        throw new BusinessException(msg, code);
    }
  }

  private orderToPlain(o: Order): Record<string, any> {
    return {
      order_id: o.order_id,
      user_id: o.user_id,
      pair_id: o.pair_id,
      side: o.side,
      type: o.type,
      price: o.price,
      amount: o.amount,
      filled_amount: o.filled_amount,
      avg_price: o.avg_price,
      status: o.status,
      time_in_force: o.time_in_force,
      reserved_quote: o.reserved_quote,
      reserved_base: o.reserved_base,
      client_order_id: o.client_order_id,
      idempotency_key: o.idempotency_key,
      slippage_tolerance: o.slippage_tolerance,
      created_at: o.created_at,
      updated_at: o.updated_at,
    };
  }

  /** Admin list/detail JSON: flat pair_symbol for clients (pair relation loaded in findAllForAdmin). */
  private orderToAdminPlain(o: Order): Record<string, any> {
    return {
      ...this.orderToPlain(o),
      pair_symbol: o.pair?.symbol ?? '',
    };
  }

  private mapToOrder(plain: Record<string, any>): Order {
    const o = new Order();
    Object.assign(o, plain);
    return o;
  }

  private orderToOrderBookOrder(o: Order): {
    order_id: string;
    pair_id: string;
    user_id: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    time_in_force: 'GTC' | 'IOC' | 'FOK' | string;
    price: string | null;
    amount: string;
    filled_amount: string;
    status: string;
    created_at: Date;
    remaining: string;
    slippage_tolerance?: string | null;
  } {
    const filled = parseFloat(o.filled_amount ?? '0');
    const amount = parseFloat(o.amount ?? '0');
    return {
      order_id: o.order_id,
      pair_id: o.pair_id,
      user_id: o.user_id,
      side: o.side,
      type: o.type,
      time_in_force: o.time_in_force ?? 'GTC',
      price: o.price ?? null,
      amount: o.amount,
      filled_amount: o.filled_amount ?? '0',
      status: o.status,
      created_at: o.created_at,
      remaining: String(amount - filled),
      slippage_tolerance: o.slippage_tolerance ?? null,
    };
  }
}
