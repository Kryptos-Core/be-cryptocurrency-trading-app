import { Test, type TestingModule } from '@nestjs/testing';
import { PriceTimePriorityStrategy } from './price-time-priority.strategy';

describe('PriceTimePriorityStrategy', () => {
  let strategy: PriceTimePriorityStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PriceTimePriorityStrategy],
    }).compile();

    strategy = module.get(PriceTimePriorityStrategy);
  });

  it('is instantiated', () => {
    expect(strategy).toBeInstanceOf(PriceTimePriorityStrategy);
  });
});
