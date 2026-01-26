import { ApiProperty } from '@nestjs/swagger';

/**
 * Order Book Entry DTO
 * DTO Pattern: Represents a single order book level
 */
export class OrderBookEntryDto {
  @ApiProperty({ example: '50000.00', description: 'Price level' })
  price!: string;

  @ApiProperty({ example: '1.5', description: 'Total amount at this price' })
  amount!: string;

  @ApiProperty({ example: 3, description: 'Number of orders at this price' })
  orders!: number;
}

/**
 * Order Book DTO
 * DTO Pattern: Complete order book structure with bids and asks
 */
export class OrderBookDto {
  @ApiProperty({ example: 'BTC/USDT' })
  symbol!: string;

  @ApiProperty({ example: 1 })
  pairId!: number;

  @ApiProperty({
    type: [OrderBookEntryDto],
    description: 'Buy orders (bids) sorted by price descending',
  })
  bids!: OrderBookEntryDto[];

  @ApiProperty({
    type: [OrderBookEntryDto],
    description: 'Sell orders (asks) sorted by price ascending',
  })
  asks!: OrderBookEntryDto[];

  @ApiProperty({ example: 20, description: 'Number of bid levels' })
  bidLevels!: number;

  @ApiProperty({ example: 20, description: 'Number of ask levels' })
  askLevels!: number;

  @ApiProperty({ example: '2024-01-22T10:30:00.000Z' })
  timestamp!: string;
}
