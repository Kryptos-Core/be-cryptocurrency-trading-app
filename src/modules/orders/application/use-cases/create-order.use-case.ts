import { ForbiddenException, NotFoundException, BusinessException } from '@/common/exceptions';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CacheService } from '@/common/services';
import { newUuid } from '@/common/utils/uuid.util';
import { Order } from '@/entities/order.entity';
import { MatchingQueueService } from '@/modules/matching/matching-queue.service';
import { CreateOrderCommand } from '@/modules/orders/commands/create-order.command';
import { PrepareCreateOrderContextService } from '@/modules/orders/application/services/prepare-create-order-context.service';
import { OrderReservePolicy } from '@/modules/orders/domain/services/order-reserve-policy.service';
import { OrderValidationService } from '@/modules/orders/domain/services/order-validation.service';
import { ORDER_REPOSITORY, type OrderRepositoryPort } from '@/modules/orders/domain/ports';

const IDEMPOTENCY_CACHE_PREFIX = 'order:idempotency:';
const IDEMPOTENCY_TTL_SEC = 86400;

@Injectable()
export class CreateOrderUseCase {
  private readonly logger = new Logger(CreateOrderUseCase.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
    private readonly cacheService: CacheService,
    private readonly validationService: OrderValidationService,
    private readonly matchingQueueService: MatchingQueueService,
    private readonly prepareCreateOrderContextService: PrepareCreateOrderContextService,
    private readonly orderReservePolicy: OrderReservePolicy,
  ) {}

  async execute(command: CreateOrderCommand): Promise<Order> {
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

    const { pair, availableQuote, availableBase } =
        await this.prepareCreateOrderContextService.execute(userId, dto.pairId);

    const bestLimitSellPrice =
      dto.type === 'MARKET' && dto.side === 'BUY'
        ? await this.orderRepository.findBestLimitSellPrice(dto.pairId)
        : null;

    const prepared = this.orderReservePolicy.prepare({
      dto,
      pair,
      availableQuote,
      availableBase,
      bestLimitSellPrice,
    });

    this.validationService.validate(prepared.validationContext);

    const result = await this.orderRepository.createOrderViaProcedure({
      orderId: newUuid(),
      userId,
      pairId: dto.pairId,
      side: dto.side,
      type: dto.type,
      price: dto.type === 'LIMIT' ? dto.price! : null,
      amount: dto.amount,
      timeInForce: dto.timeInForce ?? 'GTC',
      clientOrderId: dto.clientOrderId ?? null,
      idempotencyKey: dto.idempotencyKey,
      slippageTolerance: prepared.slippageTolerance,
      marketBuyReservedQuote: prepared.marketBuyReservedQuote,
    });

    if (result.error_code) {
      this.throwFromProcedureError(result.error_code, result.error_message ?? undefined);
    }

    if (result.order_id == null) {
      this.throwFromProcedureError('ORDER_CREATE_FAILED');
    }

    const order = await this.orderRepository.findById(result.order_id);
    if (!order) {
      this.throwFromProcedureError('ORDER_NOT_FOUND');
    }

    await this.enqueueMatching(order!, pair.quote_currency_id, pair.maker_fee_rate, pair.taker_fee_rate);
    await this.cacheService.set(cacheKey, this.orderToPlain(order!), IDEMPOTENCY_TTL_SEC);
    return order!;
  }

  private async enqueueMatching(
    order: Order,
    feeCurrencyId: string,
    makerFeeRate?: string | null,
    takerFeeRate?: string | null,
  ): Promise<void> {
    if (order.status !== 'OPEN' && order.status !== 'PARTIAL') {
      return;
    }

    const remaining = parseFloat(order.amount) - parseFloat(order.filled_amount ?? '0');
    if (remaining <= 0) {
      return;
    }

    try {
      await this.matchingQueueService.enqueueMatch({
        takerOrder: this.orderToOrderBookOrder(order),
        pairId: order.pair_id,
        feeCurrencyId,
        makerFeeRate: makerFeeRate ?? '0.001',
        takerFeeRate: takerFeeRate ?? '0.001',
        ...(order.type === 'MARKET' && order.slippage_tolerance
          ? { slippageTolerance: order.slippage_tolerance }
          : {}),
      });
    } catch (error) {
      this.logger.warn(
        `Matching enqueue failed after order create ${order.order_id}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
    }
  }

  private throwFromProcedureError(code: string, message?: string): never {
    const msg = message ?? code;
    switch (code) {
      case 'PAIR_NOT_FOUND':
        throw new NotFoundException('Market pair', '');
      case 'INVALID_PRICE':
      case 'INVALID_AMOUNT':
      case 'NO_LIQUIDITY':
      case 'INVALID_INPUT':
      case 'INVALID_MARKET_BUY_RESERVE':
      case 'ORDER_CREATE_FAILED':
        throw new BusinessException(msg, code);
      case 'INSUFFICIENT_BALANCE':
        throw new BusinessException(msg, 'INSUFFICIENT_BALANCE');
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

  private mapToOrder(plain: Record<string, any>): Order {
    const order = new Order();
    Object.assign(order, plain);
    return order;
  }

  private orderToOrderBookOrder(o: Order) {
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
