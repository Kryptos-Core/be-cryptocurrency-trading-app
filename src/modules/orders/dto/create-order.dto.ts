import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * Create Order DTO
 * DTO Pattern: Data transfer for order creation (buy/sell)
 */
export class CreateOrderDto {
  @ApiProperty({ description: 'Market pair ID', example: 1 })
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => Number(value))
  pairId!: number;

  @ApiProperty({ description: 'Order side', enum: ['BUY', 'SELL'] })
  @IsEnum(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @ApiProperty({ description: 'Order type', enum: ['LIMIT', 'MARKET'] })
  @IsEnum(['LIMIT', 'MARKET'])
  type!: 'LIMIT' | 'MARKET';

  @ApiPropertyOptional({
    description: 'Limit price (required for LIMIT orders)',
    example: '50000.00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'price must be a valid positive decimal',
  })
  price?: string;

  @ApiProperty({ description: 'Order amount (base currency)', example: '0.01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount must be a valid positive decimal',
  })
  amount!: string;

  @ApiPropertyOptional({
    description: 'Time in force',
    enum: ['GTC', 'IOC', 'FOK'],
    default: 'GTC',
  })
  @IsOptional()
  @IsEnum(['GTC', 'IOC', 'FOK'])
  timeInForce?: 'GTC' | 'IOC' | 'FOK' = 'GTC';

  @ApiPropertyOptional({
    description: 'Client-provided order ID (max 64 chars)',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientOrderId?: string;

  @ApiProperty({
    description: 'Idempotency key to prevent duplicate orders (max 64 chars)',
    example: 'uuid-v4-or-unique-string',
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  idempotencyKey!: string;
}
