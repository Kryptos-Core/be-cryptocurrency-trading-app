import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Update Market Pair DTO
 * DTO Pattern: Data transfer object for updating market pair
 * All fields are optional for partial updates
 */
export class UpdateMarketPairDto {
  @ApiPropertyOptional({
    description: 'Base currency ID. Note: Changing base currency is not recommended.',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  baseCurrencyId?: number;

  @ApiPropertyOptional({
    description: 'Quote currency ID. Note: Changing quote currency is not recommended.',
    example: 3,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  quoteCurrencyId?: number;

  @ApiPropertyOptional({
    description: 'Market pair symbol. Note: Changing symbol is not recommended.',
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
    description: 'Price decimal precision',
    example: 2,
    minimum: 0,
    maximum: 18,
  })
  @IsInt()
  @Min(0)
  @Max(18)
  @IsOptional()
  priceScale?: number;

  @ApiPropertyOptional({
    description: 'Amount decimal precision',
    example: 6,
    minimum: 0,
    maximum: 18,
  })
  @IsInt()
  @Min(0)
  @Max(18)
  @IsOptional()
  amountScale?: number;

  @ApiPropertyOptional({
    description: 'Minimum order amount',
    example: '0.0001',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'minOrderAmount must be a valid decimal number with up to 18 decimal places',
  })
  minOrderAmount?: string;

  @ApiPropertyOptional({
    description: 'Maker fee rate',
    example: 0.001,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  makerFeeRate?: number;

  @ApiPropertyOptional({
    description: 'Taker fee rate',
    example: 0.001,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  takerFeeRate?: number;

  @ApiPropertyOptional({
    description: 'Is market pair active',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
