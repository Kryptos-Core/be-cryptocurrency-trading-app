import { Inject, Injectable } from '@nestjs/common';
import { BusinessException, ForbiddenException, NotFoundException } from '@/common/exceptions';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import type { OrderLifecycleOutboxPayloadV1 } from '@/common/integration-events/order-lifecycle-outbox-payload';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { CancelOrderCommand } from '@/modules/orders/commands/cancel-order.command';
import {
  ORDER_MATCHING_GATEWAY,
  ORDER_REPOSITORY,
  type OrderMatchingGatewayPort,
  type OrderRepositoryPort,
} from '@/modules/orders/domain/ports';
import { canCancelOrder } from '@/modules/orders/states';

@Injectable()
export class CancelOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
    @Inject(ORDER_MATCHING_GATEWAY)
    private readonly orderMatchingGateway: OrderMatchingGatewayPort,
    private readonly outboxAppender: OutboxAppender,
  ) {}

  async execute(command: CancelOrderCommand) {
    const { userId, orderId } = command;
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order', orderId);
    }
    if (order.user_id !== userId) {
      throw new ForbiddenException('You can only cancel your own orders');
    }
    if (!canCancelOrder(order.status)) {
      throw new BusinessException(
        `Order cannot be cancelled (status: ${order.status})`,
        'INVALID_STATE',
      );
    }

    await this.appendOrderCancelRequestedEvent(order);

    const result = await this.orderRepository.cancelOrderViaProcedure(orderId, userId);
    if (result.error_code) {
      throw new BusinessException(result.error_message ?? result.error_code, result.error_code);
    }
    if (!result.cancelled) {
      throw new BusinessException('Cancel failed', 'CANCEL_FAILED');
    }

    if (order.side === 'BUY' || order.side === 'SELL') {
      try {
        await this.orderMatchingGateway.removeOrderFromBook(order.pair_id, orderId, order.side);
      } catch (_) {}
    }

    const updated = await this.orderRepository.findById(orderId);
    if (!updated) {
      throw new BusinessException('Order cancelled but not found', 'ORDER_NOT_FOUND');
    }

    await this.appendOrderCancelledEvent(updated);
    return updated;
  }

  private async appendOrderCancelRequestedEvent(order: {
    order_id: string;
    user_id: string;
    pair_id: string;
    side: 'BUY' | 'SELL';
    type?: 'LIMIT' | 'MARKET';
    status: string;
    amount?: string;
    filled_amount?: string;
    price?: string | null;
    time_in_force?: string | null;
    client_order_id?: string | null;
    idempotency_key?: string;
    reserved_quote?: string;
    reserved_base?: string;
    created_at?: Date;
    updated_at?: Date;
  }): Promise<void> {
    const now = new Date();
    const payload: OrderLifecycleOutboxPayloadV1 = {
      orderId: order.order_id,
      userId: order.user_id,
      pairId: order.pair_id,
      side: order.side,
      type: order.type ?? 'LIMIT',
      status: 'CANCEL_REQUESTED',
      amount: order.amount ?? '0',
      filledAmount: order.filled_amount ?? '0',
      price: order.price ?? null,
      timeInForce: order.time_in_force ?? 'GTC',
      clientOrderId: order.client_order_id ?? null,
      idempotencyKey: order.idempotency_key ?? order.order_id,
      reservedQuote: order.reserved_quote ?? '0',
      reservedBase: order.reserved_base ?? '0',
      createdAt: (order.created_at ?? now).toISOString(),
      updatedAt: (order.updated_at ?? now).toISOString(),
    };

    await this.orderRepository.transaction(async (manager) => {
      await this.outboxAppender.append(manager as never, {
        aggregateType: 'order',
        aggregateId: order.order_id,
        eventType: OutboxIntegrationEventType.OrderCancelRequestedV1,
        payload: payload as unknown as Record<string, unknown>,
        dedupeKey: `order-cancel-requested:${order.order_id}`,
        correlationId: order.idempotency_key ?? order.order_id,
        causationId: order.order_id,
        partitionKey: order.pair_id,
        kafkaTopic: 'orders.lifecycle',
      });
    });
  }

  private async appendOrderCancelledEvent(order: {
    order_id: string;
    user_id: string;
    pair_id: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    status: string;
    amount: string;
    filled_amount: string;
    price: string | null;
    time_in_force: string | null;
    client_order_id: string | null;
    idempotency_key: string;
    reserved_quote: string;
    reserved_base: string;
    created_at: Date;
    updated_at: Date;
  }): Promise<void> {
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
        eventType: OutboxIntegrationEventType.OrderCancelledV1,
        payload: payload as unknown as Record<string, unknown>,
        dedupeKey: `order-cancelled:${order.order_id}:${order.updated_at.toISOString()}`,
        correlationId: order.idempotency_key,
        causationId: order.order_id,
        partitionKey: order.pair_id,
        kafkaTopic: 'orders.lifecycle',
      });
    });
  }
}
