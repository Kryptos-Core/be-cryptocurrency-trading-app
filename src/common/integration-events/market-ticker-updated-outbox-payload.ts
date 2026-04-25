export interface MarketTickerUpdatedOutboxPayloadV1 {
  pairId: string;
  symbol: string;
  lastPrice: string;
  bid: string;
  ask: string;
  volume24h: string;
  volume24hUsd: string;
  change24h: string;
  changePercent24h: string;
  high24h: string;
  low24h: string;
  open24h: string;
  timestamp: string;
}

export function isMarketTickerUpdatedOutboxPayloadV1(
  value: unknown,
): value is MarketTickerUpdatedOutboxPayloadV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.pairId === 'string' &&
    typeof candidate.symbol === 'string' &&
    typeof candidate.lastPrice === 'string' &&
    typeof candidate.bid === 'string' &&
    typeof candidate.ask === 'string' &&
    typeof candidate.volume24h === 'string' &&
    typeof candidate.volume24hUsd === 'string' &&
    typeof candidate.change24h === 'string' &&
    typeof candidate.changePercent24h === 'string' &&
    typeof candidate.high24h === 'string' &&
    typeof candidate.low24h === 'string' &&
    typeof candidate.open24h === 'string' &&
    typeof candidate.timestamp === 'string'
  );
}
