import { ApiProperty } from '@nestjs/swagger';

/**
 * Depth Level DTO
 * Represents one aggregated price level in the order book depth.
 */
export class DepthLevelDto {
  @ApiProperty({ example: '50000.00', description: 'Price level' })
  price!: string;

  @ApiProperty({ example: '2.500000000000000000', description: 'Total amount at this price' })
  amount!: string;

  @ApiProperty({ example: 5, description: 'Number of orders at this price' })
  orderCount!: number;
}

/**
 * Depth Snapshot DTO
 * Real-time order book depth from the in-memory matching engine.
 */
export class DepthSnapshotDto {
  @ApiProperty({
    type: [DepthLevelDto],
    description: 'Buy side (bids) sorted by price descending',
  })
  bids!: DepthLevelDto[];

  @ApiProperty({
    type: [DepthLevelDto],
    description: 'Sell side (asks) sorted by price ascending',
  })
  asks!: DepthLevelDto[];

  @ApiProperty({ example: '2026-04-08T10:30:00.000Z' })
  timestamp!: string;
}
