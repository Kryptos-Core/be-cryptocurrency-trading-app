import { Test } from '@nestjs/testing';
import { ListOpenOrdersForPairQuery } from '@/modules/orders/application/queries/list-open-orders-for-pair.query';
import { OrderRepository } from '@/modules/orders/repositories';

describe('ListOpenOrdersForPairQuery', () => {
  const orderRepository = {
    findOpenByUserPair: jest.fn(),
  };

  let query: ListOpenOrdersForPairQuery;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ListOpenOrdersForPairQuery,
        { provide: OrderRepository, useValue: orderRepository },
      ],
    }).compile();

    query = moduleRef.get(ListOpenOrdersForPairQuery);
  });

  it('delegates lookup to repository', async () => {
    orderRepository.findOpenByUserPair.mockResolvedValue([{ order_id: 'o1' }]);

    const result = await query.execute('u1', 'pair-1');

    expect(orderRepository.findOpenByUserPair).toHaveBeenCalledWith('u1', 'pair-1');
    expect(result).toEqual([{ order_id: 'o1' }]);
  });
});
