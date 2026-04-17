export interface MarketPairRecord {
  pair_id: string;
  symbol: string;
  base_currency_id: string;
  quote_currency_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  amount_scale: number;
  price_scale: number;
  min_order_amount: string;
  maker_fee_rate: string;
  taker_fee_rate: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
