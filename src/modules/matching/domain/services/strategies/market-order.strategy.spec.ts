import { Test, type TestingModule } from '@nestjs/testing';
import { MarketOrderStrategy } from './market-order.strategy';

describe('MarketOrderStrategy', () => {
  let strategy: MarketOrderStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketOrderStrategy],
    }).compile();

    strategy = module.get(MarketOrderStrategy);
  });

  it('is instantiated', () => {
    expect(strategy).toBeInstanceOf(MarketOrderStrategy);
  });
});
