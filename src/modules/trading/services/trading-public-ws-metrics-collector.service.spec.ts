import { Test } from '@nestjs/testing';
import { MetricsService } from '@/telemetry';
import { PublicWsPayloadParityService } from './public-ws-payload-parity.service';
import { TradingPublicWsMetricsCollectorService } from './trading-public-ws-metrics-collector.service';

describe('TradingPublicWsMetricsCollectorService', () => {
  it('publishes parity gauges', async () => {
    const report = {
      source: 'go',
      checkedAt: '2026-04-26T00:00:00.000Z',
      ticker: { hasSample: true, contractValid: true, missingFields: [] },
      ohlc: { hasSample: true, contractValid: true, missingFields: [] },
      goAggregatorParity: { comparedPairs: 3, driftPairs: 1, topDrifts: [] },
    };

    const metricsService = {
      setPublicWsParityComparedPairs: jest.fn(),
      setPublicWsParityDriftPairs: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TradingPublicWsMetricsCollectorService,
        { provide: PublicWsPayloadParityService, useValue: { getReport: jest.fn(() => report) } },
        { provide: MetricsService, useValue: metricsService },
      ],
    }).compile();

    const service = moduleRef.get(TradingPublicWsMetricsCollectorService);
    service.collect();

    expect(metricsService.setPublicWsParityComparedPairs).toHaveBeenCalledWith('go', 3);
    expect(metricsService.setPublicWsParityDriftPairs).toHaveBeenCalledWith('go', 1);
  });
});
