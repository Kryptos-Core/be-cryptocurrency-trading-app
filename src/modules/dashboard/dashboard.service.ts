import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/common/services';
import type { MarketPairRecord } from '@/modules/markets';
import { MarketsService } from '@/modules/markets/markets.service';
import { WALLET_REPOSITORY, type WalletRepositoryPort } from '@/modules/wallets/domain/ports';
import type {
  DashboardMarketDto,
  DashboardResponseDto,
  DashboardWalletDto,
} from './dto/dashboard-response.dto';

const TOP_MARKETS_LIMIT = 10;

/**
 * Quote-currency priority for "top markets" candidate selection.
 * Lower index = higher priority (USDT pairs shown first if volumes tie).
 */
const STABLE_QUOTE_SUFFIXES = ['/USDT', '/USDC', '/FDUSD', '/BUSD'] as const;

/**
 * Maximum number of pairs we fetch individual tickers for when building top-markets.
 * Keeps the dashboard endpoint fast (avoids N+1 across 300+ active pairs).
 */
const CANDIDATE_LIMIT = TOP_MARKETS_LIMIT * 5; // 50 candidates → top 10

/**
 * Dashboard Service
 * Aggregates top markets (with live tickers) + portfolio valuation in a single call.
 *
 * Pattern: Facade — hides the complexity of joining markets + tickers + wallet prices
 * behind one clean method.
 *
 * Portfolio value: sum(wallet.total * price:{SYMBOL}USDT:latest from Redis).
 * Stablecoins (USDT/USDC/FDUSD/BUSD) count at face value 1:1.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly marketsService: MarketsService,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepositoryPort,
    private readonly redisService: RedisService,
  ) {}

  async getDashboardSummary(userId: string | null): Promise<DashboardResponseDto> {
    const [activePairs, wallets] = await Promise.all([
      this.marketsService.findActive(),
      userId
        ? // includeZero: true → return all wallets so walletCount reflects every
          // currency wallet the user owns, even those with 0 balance.
          // The FE filters what is *displayed* (only > 0), but the count is accurate.
          this.walletRepository.findByUser(userId, true)
        : Promise.resolve([] as any[]),
    ]);

    // Index pairs by symbol for O(1) scale lookup
    const pairScaleMap = new Map(
      activePairs.map((p) => [
        p.symbol,
        { priceScale: p.price_scale, amountScale: p.amount_scale },
      ]),
    );

    // Fetch tickers only for stablecoin-quoted candidates (up to CANDIDATE_LIMIT).
    // This avoids firing sp_market_ticker for every one of 300+ active pairs.
    const candidates = this.selectCandidates(activePairs);
    const tickerResults = await Promise.allSettled(
      candidates.map((p) => this.marketsService.getTicker(p.pair_id)),
    );

    // quoteVolume24h is stored as '0' in most records because Binance feeds base volume only.
    // Sort by volume24h (base asset volume) which always has real values.
    const topMarkets: DashboardMarketDto[] = tickerResults
      .filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<MarketsService['getTicker']>>> =>
          r.status === 'fulfilled',
      )
      .map((r) => r.value)
      .sort((a, b) => parseFloat(b.volume24h || '0') - parseFloat(a.volume24h || '0'))
      .slice(0, TOP_MARKETS_LIMIT)
      .map((ticker) => {
        const scale = pairScaleMap.get(ticker.symbol);
        return {
          pairId: ticker.pairId,
          symbol: ticker.symbol,
          priceScale: scale?.priceScale ?? 2,
          amountScale: scale?.amountScale ?? 6,
          lastPrice: ticker.lastPrice,
          high24h: ticker.high24h,
          low24h: ticker.low24h,
          volume24h: ticker.volume24h,
          quoteVolume24h: ticker.quoteVolume24h,
          change24h: ticker.change24h,
          changeAmount24h: ticker.changeAmount24h,
          bestBid: ticker.bestBid,
          bestAsk: ticker.bestAsk,
          open24h: ticker.open24h,
          timestamp: ticker.timestamp,
        };
      });

    const walletDtos = await this.buildWalletDtos(wallets);

    const portfolioTotal = walletDtos
      .reduce((sum, w) => sum + parseFloat(w.usdValue || '0'), 0)
      .toFixed(2);

    return {
      portfolioTotal,
      walletCount: wallets.length,
      activeWalletCount: walletDtos.filter((w) => parseFloat(w.total) > 0).length,
      topMarkets,
      wallets: walletDtos,
    };
  }

  /**
   * Selects up to CANDIDATE_LIMIT pairs for dashboard ticker fetching.
   * Prioritises stablecoin-quoted pairs (USDT → USDC → FDUSD → BUSD) as they carry
   * the most trading volume; falls back to all active pairs when fewer than needed.
   */
  private selectCandidates(pairs: MarketPairRecord[]): MarketPairRecord[] {
    const stablePairs = pairs.filter((p) =>
      STABLE_QUOTE_SUFFIXES.some((suffix) => p.symbol.endsWith(suffix)),
    );

    const pool = stablePairs.length >= TOP_MARKETS_LIMIT ? stablePairs : pairs;

    return pool
      .sort((a, b) => {
        const pa = STABLE_QUOTE_SUFFIXES.findIndex((s) => a.symbol.endsWith(s));
        const pb = STABLE_QUOTE_SUFFIXES.findIndex((s) => b.symbol.endsWith(s));
        return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      })
      .slice(0, CANDIDATE_LIMIT);
  }

  /**
   * Build wallet DTOs with estimated USD value.
   * Reads price:{SYMBOL}USDT:latest from Redis (TTL 5m, set by BinancePriceFeedService).
   * Stablecoins counted at 1 USD.
   */
  private async buildWalletDtos(wallets: any[]): Promise<DashboardWalletDto[]> {
    if (wallets.length === 0) return [];

    const STABLECOINS = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD']);

    return Promise.all(
      wallets.map(async (w) => {
        const symbol = (w.currency_symbol ?? '').toUpperCase();
        const available = w.available?.toString() ?? '0';
        const frozen = w.frozen?.toString() ?? '0';
        const totalNum = parseFloat(available) + parseFloat(frozen);
        const total = totalNum.toFixed(8);

        let usdValue = '0';

        if (STABLECOINS.has(symbol)) {
          usdValue = totalNum.toFixed(2);
        } else if (totalNum > 0 && symbol) {
          let price = 0;
          const priceRaw = await this.redisService.get(`price:${symbol}USDT:latest`);
          if (priceRaw) {
            try {
              const priceData = JSON.parse(priceRaw) as { last_price?: string };
              price = parseFloat(priceData.last_price ?? '0');
            } catch {
              this.logger.warn(`Failed to parse Redis price for ${symbol}`);
            }
          }
          if (price <= 0) {
            try {
              const ticker = await this.marketsService.getTickerBySymbol(`${symbol}/USDT`);
              price = parseFloat(ticker?.lastPrice ?? '0') || 0;
            } catch {
              /* Pair may not exist — keep usdValue 0 */
            }
          }
          if (price > 0) {
            usdValue = (totalNum * price).toFixed(2);
          }
        }

        return {
          walletId: w.wallet_id,
          currencyId: w.currency_id,
          currencySymbol: symbol,
          currencyName: w.currency_name ?? '',
          available,
          frozen,
          total,
          usdValue,
        };
      }),
    );
  }
}
