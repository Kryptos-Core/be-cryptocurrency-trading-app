import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { MockExchangeService } from './mock-exchange.service';

describe('MockExchangeService', () => {
  async function createService(mock: { balance?: string; price?: string }) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockExchangeService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'app.trading.mockExchange.balance') return mock.balance ?? '10000';
              if (key === 'app.trading.mockExchange.orderStatusPrice') return mock.price ?? '50000';
              return undefined;
            },
          },
        },
      ],
    }).compile();
    return module.get(MockExchangeService);
  }

  it('getBalance uses MOCK_EXCHANGE_BALANCE from config', async () => {
    const svc = await createService({ balance: '42' });
    const b = await svc.getBalance('BTC');
    expect(b.available.eq(new Decimal(42))).toBe(true);
  });

  it('getOrderStatus uses MOCK_EXCHANGE_ORDER_STATUS_PRICE from config', async () => {
    const svc = await createService({ price: '12345' });
    const o = await svc.getOrderStatus('x', 'BTCUSDT');
    expect(o.price.eq(new Decimal(12345))).toBe(true);
  });
});
