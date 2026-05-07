import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PublicWsPayloadParityService } from './public-ws-payload-parity.service';

describe('PublicWsPayloadParityService', () => {
  it('reports contract issues when no samples exist', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicWsPayloadParityService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('nestjs'),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(PublicWsPayloadParityService);
    const report = service.getReport();

    expect(report.ticker.hasSample).toBe(false);
    expect(report.ohlc.hasSample).toBe(false);
    expect(report.goAggregatorParity.comparedPairs).toBe(0);
  });

  it('reports valid contract and no drift when external == emitted', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicWsPayloadParityService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('go'),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(PublicWsPayloadParityService);

    const ticker = {
      pair_id: 'pair-1',
      symbol: 'BTC/USDT',
      last_price: '100',
      bid: '99.9',
      ask: '100.1',
      volume_24h: '1.5',
      volume_24h_usd: '150',
      change_24h: '1',
      change_percent_24h: '1',
      high_24h: '105',
      low_24h: '95',
      open_24h: '99',
      timestamp: '2026-04-26T00:00:00.000Z',
    };

    const ohlc = {
      pair_id: 'pair-1',
      symbol: 'BTC/USDT',
      interval: '1m' as const,
      open_time: 1,
      close_time: 2,
      open: '99',
      high: '100',
      low: '98',
      close: '100',
      volume: '10',
      quote_volume: '1000',
      trades_count: 10,
      is_closed: true,
    };

    service.recordExternalTicker(ticker);
    service.onTicker(ticker);
    service.onOhlc(ohlc);

    const report = service.getReport();

    expect(report.ticker.contractValid).toBe(true);
    expect(report.ohlc.contractValid).toBe(true);
    expect(report.goAggregatorParity.comparedPairs).toBe(1);
    expect(report.goAggregatorParity.driftPairs).toBe(0);
  });
});
