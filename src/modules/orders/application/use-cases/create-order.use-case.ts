import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessException, ForbiddenException, NotFoundException } from '@/common/exceptions';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import type { OrderLifecycleOutboxPayloadV1 } from '@/common/integration-events/order-lifecycle-outbox-payload';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { CacheService } from '@/common/services';
import { newUuid } from '@/common/utils/uuid.util';
import { Order } from '@/entities/order.entity';
import { PrepareCreateOrderContextService } from '@/modules/orders/application/services/prepare-create-order-context.service';
import { CreateOrderCommand } from '@/modules/orders/commands/create-order.command';
import {
  ORDER_MATCHING_GATEWAY,
  ORDER_REPOSITORY,
  type OrderBookOrderSnapshot,
  type OrderMatchingGatewayPort,
  type OrderRepositoryPort,
} from '@/modules/orders/domain/ports';
import { OrderReservePolicy } from '@/modules/orders/domain/services/order-reserve-policy.service';
import { OrderValidationService } from '@/modules/orders/domain/services/order-validation.service';

const IDEMPOTENCY_CACHE_PREFIX = 'order:idempotency:';
const IDEMPOTENCY_TTL_SEC = 86400;

export type PlainOrderResponse = {
  order_id: string;
  user_id: string;
  pair_id: string;
  side: Order['side'];
  type: Order['type'];
  price: Order['price'];
  amount: string;
  filled_amount: string;
  avg_price: Order['avg_price'];
  status: Order['status'];
  time_in_force: Order['time_in_force'];
  reserved_quote: string;
  reserved_base: string;
  client_order_id: Order['client_order_id'];
  idempotency_key: string;
  slippage_tolerance: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class CreateOrderUseCase {
  private readonly logger = new Logger(CreateOrderUseCase.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
    private readonly cacheService: CacheService,
    private readonly validationService: OrderValidationService,
    @Inject(ORDER_MATCHING_GATEWAY)
    private readonly orderMatchingGateway: OrderMatchingGatewayPort,
    private readonly prepareCreateOrderContextService: PrepareCreateOrderContextService,
    private readonly orderReservePolicy: OrderReservePolicy,
    private readonly outboxAppender: OutboxAppender,
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

    let limitPrice: string | null = null;
    if (dto.type === 'LIMIT') {
      if (dto.price == null || dto.price === '') {
        this.throwFromProcedureError('INVALID_INPUT', 'price is required for LIMIT orders');
      }
      limitPrice = dto.price;
    }

    const orderId = newUuid();
    const result = await this.orderRepository.createOrderViaProcedure({
      orderId,
      userId,
      pairId: dto.pairId,
      side: dto.side,
      type: dto.type,
      price: limitPrice,
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

    await this.enqueueMatching(
      order,
      pair.quote_currency_id,
      pair.maker_fee_rate,
      pair.taker_fee_rate,
    );

    await this.appendOrderCreatedEvent(order);
    await this.cacheService.set(cacheKey, this.orderToPlain(order), IDEMPOTENCY_TTL_SEC);
    return order;
  }

  private async appendOrderCreatedEvent(order: Order): Promise<void> {
    const payload: OrderLifecycleOutboxPayloadV1 = {
      orderId: order.order_id,
      userId: order.user_id,
      pairId: order.pair_id,
      side: order.side,
      type: order.type,
      status: order.status,
      amount: order.amount,
      filledAmount: order.filled_amount ?? '0',
      price: order.price,
      timeInForce: order.time_in_force ?? 'GTC',
      clientOrderId: order.client_order_id ?? null,
      idempotencyKey: order.idempotency_key,
      reservedQuote: order.reserved_quote,
      reservedBase: order.reserved_base,
      createdAt: order.created_at.toISOString(),
      updatedAt: order.updated_at.toISOString(),
    };

    await this.orderRepository.transaction(async (manager) => {
      await this.outboxAppender.append(manager as never, {
        aggregateType: 'order',
        aggregateId: order.order_id,
        eventType: OutboxIntegrationEventType.OrderCreatedV1,
        payload: payload as unknown as Record<string, unknown>,
        dedupeKey: `order-created:${order.order_id}`,
        correlationId: order.idempotency_key,
        causationId: order.order_id,
        partitionKey: order.pair_id,
        kafkaTopic: 'orders.lifecycle',
      });
    });
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
      await this.orderMatchingGateway.enqueueMatch({
        takerOrder: this.orderToOrderBookOrder(order),
        pairId: order.pair_id,
        feeCurrencyId,
        makerFeeRate: makerFeeRate ?? '0.001',
        takerFeeRate: takerFeeRate ?? '0.001',
        slippageTolerance:
          order.type === 'MARKET' ? (order.slippage_tolerance ?? undefined) : undefined,
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

  private orderToPlain(o: Order): PlainOrderResponse {
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

  private mapToOrder(plain: PlainOrderResponse): Order {
    const order = new Order();
    Object.assign(order, plain);
    return order;
  }

  private orderToOrderBookOrder(o: Order): OrderBookOrderSnapshot {
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


