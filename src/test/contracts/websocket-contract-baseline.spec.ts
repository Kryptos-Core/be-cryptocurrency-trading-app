import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PublicWsPayloadParityService } from '@/modules/trading/services/public-ws-payload-parity.service';

describe('WebSocket contract baseline snapshots', () => {
  it('locks /trading payload shape for ticker + ohlc events', async () => {
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
      open_time: 1714080000,
      close_time: 1714080060,
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

    expect({
      tickerEvent: {
        type: 'ticker',
        data: ticker,
      },
      ohlcEvent: {
        type: 'ohlc',
        data: ohlc,
      },
      parityHealth: { ...service.getReport(), checkedAt: '__dynamic__' },
    }).toMatchSnapshot();
  });
});

