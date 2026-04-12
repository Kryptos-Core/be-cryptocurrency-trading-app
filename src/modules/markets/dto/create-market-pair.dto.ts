import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Create Market Pair DTO
 * DTO Pattern: Data transfer object for creating market pair
 * Validation Pattern: Input validation at DTO level
 */
export class CreateMarketPairDto {
  @ApiProperty({
    description: 'Base currency ID (e.g., BTC)',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsNotEmpty({ message: 'Base currency ID is required' })
  baseCurrencyId!: number;

  @ApiProperty({
    description: 'Quote currency ID (e.g., USDT)',
    example: 3,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsNotEmpty({ message: 'Quote currency ID is required' })
  quoteCurrencyId!: number;

  @ApiPropertyOptional({
    description: 'Market pair symbol (e.g., BTC/USDT). Auto-generated if not provided.',
    example: 'BTC/USDT',
    minLength: 3,
    maxLength: 32,
    pattern: '^[A-Z0-9]+/[A-Z0-9]+$',
  })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z0-9]+\/[A-Z0-9]+$/, {
    message: 'Symbol must be in format BASE/QUOTE (e.g., BTC/USDT)',
  })
  symbol?: string;

  @ApiPropertyOptional({
    description: 'Price decimal precision (default: 2)',
    example: 2,
    minimum: 0,
    maximum: 18,
    default: 2,
  })
  @IsInt()
  @Min(0)
  @Max(18)
  @IsOptional()
  priceScale?: number = 2;

  @ApiPropertyOptional({
    description: 'Amount decimal precision (default: 6)',
    example: 6,
    minimum: 0,
    maximum: 18,
    default: 6,
  })
  @IsInt()
  @Min(0)
  @Max(18)
  @IsOptional()
  amountScale?: number = 6;

  @ApiPropertyOptional({
    description: 'Minimum order amount',
    example: '0.0001',
    default: '0.0001',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'minOrderAmount must be a valid decimal number with up to 18 decimal places',
  })
  minOrderAmount?: string = '0.0001';

  @ApiPropertyOptional({
    description: 'Maker fee rate (default: 0.001 = 0.1%)',
    example: 0.001,
    minimum: 0,
    maximum: 1,
    default: 0.001,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  makerFeeRate?: number = 0.001;

  @ApiPropertyOptional({
    description: 'Taker fee rate (default: 0.001 = 0.1%)',
    example: 0.001,
    minimum: 0,
    maximum: 1,
    default: 0.001,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  takerFeeRate?: number = 0.001;

  @ApiPropertyOptional({
    description: 'Is market pair active',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}
