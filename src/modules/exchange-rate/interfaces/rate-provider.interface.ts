export interface MarketPriceItem {
  symbol: string;
  priceUsd: string;
  priceVnd: string;
}

export interface MarketPricesSnapshot {
  prices: MarketPriceItem[];
  updatedAt: string;
}

export interface UsdtVndMarketSnapshot {
  marketRate: string;
  updatedAt: string;
  source: string;
}
