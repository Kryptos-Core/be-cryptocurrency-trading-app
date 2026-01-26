import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Market Pair Response DTO
 * DTO Pattern: Data transfer object for market pair response
 */
export class MarketPairResponseDto {
  @ApiProperty({ example: 1 })
  pair_id!: number;

  @ApiProperty({ example: 1 })
  base_currency_id!: number;

  @ApiProperty({ example: 3 })
  quote_currency_id!: number;

  @ApiProperty({ example: 'BTC/USDT' })
  symbol!: string;

  @ApiProperty({ example: 2 })
  price_scale!: number;

  @ApiProperty({ example: 6 })
  amount_scale!: number;

  @ApiProperty({ example: '0.0001' })
  min_order_amount!: string;

  @ApiProperty({ example: '0.00100000' })
  maker_fee_rate!: string;

  @ApiProperty({ example: '0.00100000' })
  taker_fee_rate!: string;

  @ApiProperty({ example: true })
  is_active!: boolean;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00.000Z' })
  created_at?: Date;

  @ApiPropertyOptional({ example: { currency_id: 1, symbol: 'BTC', name: 'Bitcoin' } })
  base_currency?: {
    currency_id: number;
    symbol: string;
    name: string;
  };

  @ApiPropertyOptional({ example: { currency_id: 3, symbol: 'USDT', name: 'Tether' } })
  quote_currency?: {
    currency_id: number;
    symbol: string;
    name: string;
  };
}
