import { Test } from '@nestjs/testing';
import { TradingOpsController } from './trading-ops.controller';
import { PublicWsPayloadParityService } from './services/public-ws-payload-parity.service';

describe('TradingOpsController', () => {
  it('returns public ws parity report', async () => {
    const report = {
      source: 'nestjs',
      checkedAt: '2026-04-26T00:00:00.000Z',
      ticker: { hasSample: true, contractValid: true, missingFields: [] },
      ohlc: { hasSample: true, contractValid: true, missingFields: [] },
      goAggregatorParity: { comparedPairs: 1, driftPairs: 0, topDrifts: [] },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TradingOpsController],
      providers: [
        {
          provide: PublicWsPayloadParityService,
          useValue: {
            getReport: jest.fn().mockReturnValue(report),
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(TradingOpsController);
    expect(controller.getPublicWsParity()).toEqual(report);
  });
});
