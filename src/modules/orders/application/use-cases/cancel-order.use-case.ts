import { Inject, Injectable } from '@nestjs/common';
import { BusinessException, ForbiddenException, NotFoundException } from '@/common/exceptions';
import { MatchingService } from '@/modules/matching/matching.service';
import { CancelOrderCommand } from '@/modules/orders/commands/cancel-order.command';
import { ORDER_REPOSITORY, type OrderRepositoryPort } from '@/modules/orders/domain/ports';
import { canCancelOrder } from '@/modules/orders/states';

@Injectable()
export class CancelOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
    private readonly matchingService: MatchingService,
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
    if (!canCancelOrder(order.status as any)) {
      throw new BusinessException(
        `Order cannot be cancelled (status: ${order.status})`,
        'INVALID_STATE',
      );
    }

    const result = await this.orderRepository.cancelOrderViaProcedure(orderId, userId);
    if (result.error_code) {
      throw new BusinessException(result.error_message ?? result.error_code, result.error_code);
    }
    if (!result.cancelled) {
      throw new BusinessException('Cancel failed', 'CANCEL_FAILED');
    }

    if (order.side === 'BUY' || order.side === 'SELL') {
      try {
        this.matchingService.removeOrderFromBook(order.pair_id, orderId, order.side);
      } catch (_) {}
    }

    const updated = await this.orderRepository.findById(orderId);
    if (!updated) {
      throw new BusinessException('Order cancelled but not found', 'ORDER_NOT_FOUND');
    }
    return updated;
  }
}
