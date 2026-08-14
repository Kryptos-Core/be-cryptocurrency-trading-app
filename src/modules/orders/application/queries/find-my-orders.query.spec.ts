import { Test } from '@nestjs/testing';
import { CacheService } from '@/common/services';
import { FindMyOrdersQuery } from '@/modules/orders/application/queries/find-my-orders.query';
import { ORDER_REPOSITORY } from '@/modules/orders/domain/ports';

describe('FindMyOrdersQuery', () => {
  const orderRepository = {
    findByUser: jest.fn(),
    countByUser: jest.fn(),
  };

  const cacheService = {
    getOrSet: jest.fn(async (_key: string, factory: () => Promise<unknown>) => factory()),
  };

  let query: FindMyOrdersQuery;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FindMyOrdersQuery,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    query = moduleRef.get(FindMyOrdersQuery);
  });

  it('returns paginated orders and total', async () => {
    orderRepository.findByUser.mockResolvedValue([{ order_id: 'o1' }]);
    orderRepository.countByUser.mockResolvedValue(1);

    const result = await query.execute('u1', 2, 10, 'OPEN');

    expect(orderRepository.findByUser).toHaveBeenCalledWith('u1', 'OPEN', 10, 10);
    expect(orderRepository.countByUser).toHaveBeenCalledWith('u1', 'OPEN');
    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });
});
