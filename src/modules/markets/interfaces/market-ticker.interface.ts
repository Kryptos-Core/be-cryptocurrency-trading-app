/**
 * Internal ticker data shape returned by MarketRepository.getTicker
 * and by OHLCV fallback. Service layer adds symbol, pairId, timestamp.
 */
export interface IMarketTickerData {
  lastPrice: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  quoteVolume24h: string;
  change24h: string;
  changeAmount24h: string;
  bestBid: string;
  bestAsk: string;
}
