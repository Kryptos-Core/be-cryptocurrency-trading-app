import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Order Response DTO
 * DTO Pattern: Response shape for order resource
 */
export class OrderResponseDto {
  @ApiProperty({ example: 1 })
  order_id!: number;

  @ApiProperty({ example: 1 })
  user_id!: number;

  @ApiProperty({ example: 1 })
  pair_id!: number;

  @ApiProperty({ enum: ['BUY', 'SELL'] })
  side!: 'BUY' | 'SELL';

  @ApiProperty({ enum: ['LIMIT', 'MARKET'] })
  type!: 'LIMIT' | 'MARKET';

  @ApiPropertyOptional({ example: '50000.00' })
  price!: string | null;

  @ApiProperty({ example: '0.01' })
  amount!: string;

  @ApiProperty({ example: '0' })
  filled_amount!: string;

  @ApiPropertyOptional({ example: '50000.00' })
  avg_price!: string | null;

  @ApiProperty({
    enum: ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'],
  })
  status!: 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED';

  @ApiProperty({ enum: ['GTC', 'IOC', 'FOK'] })
  time_in_force!: 'GTC' | 'IOC' | 'FOK';

  @ApiProperty({ example: '0' })
  reserved_quote!: string;

  @ApiProperty({ example: '0' })
  reserved_base!: string;

  @ApiPropertyOptional()
  client_order_id!: string | null;

  @ApiProperty()
  idempotency_key!: string;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;
}
