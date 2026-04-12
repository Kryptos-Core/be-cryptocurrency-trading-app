import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Create Order DTO
 * DTO Pattern: Data transfer for order creation (buy/sell)
 */
export class CreateOrderDto {
  @ApiProperty({
    description: 'Market pair ID (UUID)',
    example: '018e9a7b-1234-7abc-8000-000000000001',
  })
  @IsString()
  @IsNotEmpty()
  pairId!: string;

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

  @ApiPropertyOptional({
    description:
      'Slippage as decimal fraction (e.g. "0.01" = 1%). Required for MARKET BUY (quote reserve cap). ' +
      'Optional for MARKET SELL (match-time protection). Ignored for LIMIT.',
    example: '0.01',
  })
  @ValidateIf((o: CreateOrderDto) => o.type !== 'MARKET')
  @IsOptional()
  @ValidateIf((o: CreateOrderDto) => o.type === 'MARKET' && o.side === 'BUY')
  @IsNotEmpty({
    message: 'slippageTolerance is required for MARKET BUY orders',
  })
  @ValidateIf(
    (o: CreateOrderDto) =>
      o.type === 'MARKET' &&
      (o.side === 'BUY' ||
        (o.slippageTolerance != null && String(o.slippageTolerance).trim() !== '')),
  )
  @IsString()
  @Matches(/^0(\.\d{1,18})?$/, {
    message: 'slippageTolerance must be a decimal fraction between 0 and 1 (e.g. "0.01")',
  })
  slippageTolerance?: string;
}
