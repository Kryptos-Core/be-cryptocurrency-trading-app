import { Test } from '@nestjs/testing';
import { BusinessException, ForbiddenException, NotFoundException } from '@/common/exceptions';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { CancelOrderUseCase } from '@/modules/orders/application/use-cases/cancel-order.use-case';
import { ORDER_MATCHING_GATEWAY, ORDER_REPOSITORY } from '@/modules/orders/domain/ports';

describe('CancelOrderUseCase', () => {
  const orderRepository = {
    findById: jest.fn(),
    cancelOrderViaProcedure: jest.fn(),
    transaction: jest.fn(async (work) => work({})),
  };
  const orderMatchingGateway = {
    removeOrderFromBook: jest.fn(),
  };
  const outboxAppender = {
    append: jest.fn(),
  };

  let useCase: CancelOrderUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CancelOrderUseCase,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        { provide: ORDER_MATCHING_GATEWAY, useValue: orderMatchingGateway },
        { provide: OutboxAppender, useValue: outboxAppender },
      ],
    }).compile();

    useCase = moduleRef.get(CancelOrderUseCase);
  });

  it('rejects when order is missing', async () => {
    orderRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ userId: 'u1', orderId: 'o1' } as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects when order belongs to another user', async () => {
    orderRepository.findById.mockResolvedValue({ order_id: 'o1', user_id: 'u2' });

    await expect(useCase.execute({ userId: 'u1', orderId: 'o1' } as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('cancels, reloads and appends cancelled outbox event', async () => {
    orderRepository.findById
      .mockResolvedValueOnce({
        order_id: 'o1',
        user_id: 'u1',
        pair_id: 'p1',
        side: 'BUY',
        status: 'OPEN',
      })
      .mockResolvedValueOnce({
        order_id: 'o1',
        user_id: 'u1',
        pair_id: 'p1',
        side: 'BUY',
        type: 'LIMIT',
        status: 'CANCELLED',
        amount: '1',
        filled_amount: '0',
        price: '100',
        time_in_force: 'GTC',
        client_order_id: null,
        idempotency_key: 'idem-1',
        reserved_quote: '0',
        reserved_base: '0',
        created_at: new Date('2026-04-25T00:00:00.000Z'),
        updated_at: new Date('2026-04-25T00:01:00.000Z'),
      });
    orderRepository.cancelOrderViaProcedure.mockResolvedValue({ cancelled: 1, error_code: null });

    const result = await useCase.execute({ userId: 'u1', orderId: 'o1' } as any);

    expect(orderRepository.cancelOrderViaProcedure).toHaveBeenCalledWith('o1', 'u1');
    expect(orderMatchingGateway.removeOrderFromBook).toHaveBeenCalledWith('p1', 'o1', 'BUY');
    expect(orderRepository.transaction).toHaveBeenCalledTimes(1);
    expect(outboxAppender.append).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        aggregateType: 'order',
        aggregateId: 'o1',
        eventType: 'order.cancelled',
        kafkaTopic: 'orders.lifecycle',
      }),
    );
    expect(result.status).toBe('CANCELLED');
  });

  it('fails when procedure returns not cancelled', async () => {
    orderRepository.findById.mockResolvedValue({
      order_id: 'o1',
      user_id: 'u1',
      pair_id: 'p1',
      side: 'BUY',
      status: 'OPEN',
    });
    orderRepository.cancelOrderViaProcedure.mockResolvedValue({ cancelled: 0, error_code: null });

    await expect(useCase.execute({ userId: 'u1', orderId: 'o1' } as any)).rejects.toBeInstanceOf(
      BusinessException,
    );
  });
});
