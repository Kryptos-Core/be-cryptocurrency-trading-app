import { ApiProperty } from '@nestjs/swagger';

/**
 * Market Ticker DTO
 * DTO Pattern: Data transfer object for market ticker information
 * Represents current market statistics for a trading pair
 */
export class MarketTickerDto {
  @ApiProperty({ example: 'BTC/USDT' })
  symbol!: string;

  @ApiProperty({ example: '018e9a7b-1234-7abc-8000-000000000001' })
  pairId!: string;

  @ApiProperty({ example: '50000.00', description: 'Last trade price' })
  lastPrice!: string;

  @ApiProperty({ example: '50010.00', description: 'Highest price in 24h' })
  high24h!: string;

  @ApiProperty({ example: '49900.00', description: 'Lowest price in 24h' })
  low24h!: string;

  @ApiProperty({ example: '100.5', description: '24h volume in base currency' })
  volume24h!: string;

  @ApiProperty({ example: '5025000.00', description: '24h volume in quote currency' })
  quoteVolume24h!: string;

  @ApiProperty({ example: '0.02', description: '24h price change percentage' })
  change24h!: string;

  @ApiProperty({ example: '1000.00', description: '24h price change amount' })
  changeAmount24h!: string;

  @ApiProperty({ example: '50005.00', description: 'Best bid price' })
  bestBid!: string;

  @ApiProperty({ example: '50015.00', description: 'Best ask price' })
  bestAsk!: string;

  @ApiProperty({ example: '50010.00', description: 'Opening price 24h ago' })
  open24h!: string;

  @ApiProperty({ example: '2024-01-22T10:30:00.000Z' })
  timestamp!: string;
}
