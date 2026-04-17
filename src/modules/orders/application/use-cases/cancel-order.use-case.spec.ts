import { Test } from '@nestjs/testing';
import { BusinessException, ForbiddenException, NotFoundException } from '@/common/exceptions';
import { RemoveOrderFromBookUseCase } from '@/modules/matching/application/use-cases';
import { CancelOrderUseCase } from '@/modules/orders/application/use-cases/cancel-order.use-case';
import { ORDER_REPOSITORY } from '@/modules/orders/domain/ports';

describe('CancelOrderUseCase', () => {
  const orderRepository = {
    findById: jest.fn(),
    cancelOrderViaProcedure: jest.fn(),
  };
  const removeOrderFromBookUseCase = {
    execute: jest.fn(),
  };

  let useCase: CancelOrderUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CancelOrderUseCase,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        { provide: RemoveOrderFromBookUseCase, useValue: removeOrderFromBookUseCase },
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

  it('cancels and reloads the updated order', async () => {
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
        status: 'CANCELLED',
      });
    orderRepository.cancelOrderViaProcedure.mockResolvedValue({ cancelled: 1, error_code: null });

    const result = await useCase.execute({ userId: 'u1', orderId: 'o1' } as any);

    expect(orderRepository.cancelOrderViaProcedure).toHaveBeenCalledWith('o1', 'u1');
    expect(removeOrderFromBookUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ pairId: 'p1', orderId: 'o1', side: 'BUY' }),
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
