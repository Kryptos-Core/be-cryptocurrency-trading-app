jest.mock('@/modules/exchange-rate/providers/coingecko.provider');
jest.mock('@/modules/system-config/system-config.service');

import { CoinGeckoProvider } from '@/modules/exchange-rate/providers/coingecko.provider';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { TradingPriceValidatorService } from './trading-price-validator.service';

describe('TradingPriceValidatorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildSvc(overrides: {
    getMarketPrices?: jest.Mock;
    configGet?: jest.Mock;
  }) {
    const mockProvider = {
      getMarketPrices: overrides.getMarketPrices ?? jest.fn(),
    };
    const mockConfig = {
      get: overrides.configGet ?? jest.fn().mockResolvedValue(null),
    };
    (CoinGeckoProvider as unknown as jest.Mock).mockImplementation(() => mockProvider);
    (SystemConfigService as unknown as jest.Mock).mockImplementation(() => mockConfig);
    return new TradingPriceValidatorService(
      mockProvider as unknown as CoinGeckoProvider,
      mockConfig as unknown as SystemConfigService,
    );
  }

  // --- Happy path ---

  describe('validate — valid trades', () => {
    it('returns valid=true when trade price matches market price exactly', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '50000', 'BUY');
      expect(result.valid).toBe(true);
      expect(result.deviationPct).toBe('0.000000');
    });

    it('returns valid=true when trade price is within 1% slippage threshold', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '50250', 'BUY');
      expect(result.valid).toBe(true);
      expect(parseFloat(result.deviationPct)).toBeCloseTo(0.5, 2);
    });

    it('returns valid=true when trade price is at the slippage boundary (1%)', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'ETH', priceUsd: '2000', priceVnd: '50000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('ETH_USDT', '2020', 'SELL');
      expect(result.valid).toBe(true);
    });

    it('handles SELL side correctly (absolute deviation)', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '49800', 'SELL');
      expect(result.valid).toBe(true);
      expect(parseFloat(result.deviationPct)).toBeCloseTo(0.4, 2);
    });

    it('includes correct prices and threshold in result', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '50100', 'BUY');
      expect(result.marketPrice).toBe('50000');
      expect(result.tradePrice).toBe('50100');
      expect(result.maxAllowedPct).toBe('1'); // '0.01' config = 1%
    });
  });

  // --- Price manipulation detection ---

  describe('validate — price manipulation suspicion', () => {
    it('returns valid=false when deviation exceeds max slippage threshold', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '52500', 'BUY');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('deviates');
      expect(parseFloat(result.deviationPct)).toBeCloseTo(5.0, 1);
    });

    it('flags downward manipulation (sell at much lower price)', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '45000', 'SELL');
      expect(result.valid).toBe(false);
      expect(parseFloat(result.deviationPct)).toBeCloseTo(10.0, 1);
    });

    it('returns valid=false for extreme upward deviation (>50%)', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'ETH', priceUsd: '2000', priceVnd: '50000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('ETH_USDT', '4000', 'BUY');
      expect(result.valid).toBe(false);
      expect(parseFloat(result.deviationPct)).toBeCloseTo(100.0, 1);
    });

    it('sets reason message with side, pair, and manipulation hint', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '53000', 'BUY');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('BTC_USDT');
      expect(result.reason).toContain('BUY');
      expect(result.reason).toContain('price manipulation');
    });
  });

  // --- Stale market price ---

  describe('validate — stale market price', () => {
    it('marks result as stale=true when market price is older than 5-minute threshold', async () => {
      const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: oldTimestamp,
        }),
      });
      const result = await svc.validate('BTC_USDT', '50000', 'BUY');
      expect(result.stale).toBe(true);
      expect(result.staleMs).toBeGreaterThan(300_000);
    });

    it('marks result as stale=false when market price is fresh (< 5 min)', async () => {
      const recentTimestamp = new Date(Date.now() - 60_000).toISOString();
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: recentTimestamp,
        }),
      });
      const result = await svc.validate('BTC_USDT', '50000', 'BUY');
      expect(result.stale).toBe(false);
    });

    it('returns valid=false for zero market price', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '0', priceVnd: '0' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '50000', 'BUY');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be positive');
      expect(result.stale).toBe(false);
    });

    it('returns valid=false for zero trade price', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '0', 'BUY');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be positive');
    });

    it('returns valid=false for negative prices', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '-100', priceVnd: '-2500000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '50000', 'BUY');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be positive');
    });

    it('returns valid=true but stale=true when price is valid but market is stale', async () => {
      const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: oldTimestamp,
        }),
      });
      const result = await svc.validate('BTC_USDT', '50100', 'BUY');
      expect(result.valid).toBe(true);
      expect(result.stale).toBe(true);
      expect(result.reason).toContain('stale');
    });
  });

  // --- Edge cases ---

  describe('validate — edge cases', () => {
    it('returns valid=true for pairId with no underscore (single-word symbol)', async () => {
      // 'INVALID'.split('_') returns ['INVALID'] — baseSymbol is 'INVALID', NOT empty.
      // So validation proceeds: asks for 'INVALID' price, gets staleRef, returns valid=true.
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'INVALID', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('INVALID', '50000', 'BUY');
      expect(result.valid).toBe(true);
    });

    it('returns valid=false when CoinGecko returns no matching symbol (uses staleRef with non-zero placeholder)', async () => {
      // When symbol not found, staleRef returns non-zero placeholder price.
      // The tiny placeholder price causes extreme deviation → valid=false.
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'ETH', priceUsd: '2000', priceVnd: '50000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '50000', 'BUY');
      expect(result.valid).toBe(false);
      expect(result.stale).toBe(true);
    });

    it('handles CoinGecko provider error gracefully (staleRef with non-zero placeholder)', async () => {
      // When getMarketPrices resolves but prices is undefined → staleRef → non-zero placeholder
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({ prices: undefined as any }),
      });
      const result = await svc.validate('BTC_USDT', '50000', 'BUY');
      // Placeholder price causes deviation → valid=false, but marked stale
      expect(result.stale).toBe(true);
    });

    it('handles extremely large price values without overflow', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '100000000', priceVnd: '2500000000000' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('BTC_USDT', '100100000', 'BUY');
      expect(result.valid).toBe(true);
      expect(parseFloat(result.deviationPct)).toBeCloseTo(0.1, 2);
    });

    it('handles very small price values correctly', async () => {
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'DOGE', priceUsd: '0.05', priceVnd: '1250' }],
          updatedAt: new Date().toISOString(),
        }),
      });
      const result = await svc.validate('DOGE_USDT', '0.0505', 'BUY');
      expect(result.valid).toBe(true);
      expect(parseFloat(result.deviationPct)).toBeCloseTo(1.0, 0);
    });
  });

  // --- Config integration ---

  describe('validate — config integration', () => {
    it('uses config value when max_slippage_pct is configured', async () => {
      // '0.10' in config = 0.10 decimal = 10% threshold
      // deviation 5% (52500 vs 50000) < 10% → should pass
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
        configGet: jest.fn().mockImplementation(async (key: string) => {
          if (key === 'trading.max_slippage_pct') return '0.10';
          return null;
        }),
      });
      const result = await svc.validate('BTC_USDT', '52500', 'BUY');
      expect(result.valid).toBe(true);
      expect(result.maxAllowedPct).toBe('10'); // 0.10 * 100 = 10
    });

    it('ignores config value when slippage pct is out of range (> 100)', async () => {
      // '150' means 150 decimal = 15000% threshold (way over range)
      // service should reject this and fall back to default 1%
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: new Date().toISOString(),
        }),
        configGet: jest.fn().mockImplementation(async (key: string) => {
          if (key === 'trading.max_slippage_pct') return '150';
          return null;
        }),
      });
      const result = await svc.validate('BTC_USDT', '52500', 'BUY');
      expect(result.valid).toBe(false);
      expect(result.maxAllowedPct).toBe('1'); // falls back to default 1%
    });

    it('uses config value for stale threshold when configured', async () => {
      const fiveMinAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: fiveMinAgo,
        }),
        configGet: jest.fn().mockImplementation(async (key: string) => {
          if (key === 'trading.price_stale_threshold_ms') return '600000';
          return null;
        }),
      });
      const result = await svc.validate('BTC_USDT', '50000', 'BUY');
      expect(result.stale).toBe(false);
    });

    it('falls back to default 5-minute stale threshold when config returns invalid', async () => {
      const fourMinAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const svc = buildSvc({
        getMarketPrices: jest.fn().mockResolvedValue({
          prices: [{ symbol: 'BTC', priceUsd: '50000', priceVnd: '1250000000' }],
          updatedAt: fourMinAgo,
        }),
        configGet: jest.fn().mockImplementation(async (key: string) => {
          if (key === 'trading.price_stale_threshold_ms') return 'invalid';
          return null;
        }),
      });
      const result = await svc.validate('BTC_USDT', '50000', 'BUY');
      expect(result.stale).toBe(false);
    });
  });
});
