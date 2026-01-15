import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Update Currency DTO
 * DTO Pattern: Data transfer object for updating currency
 */
export class UpdateCurrencyDto {
  @ApiPropertyOptional({
    description: 'Currency symbol (e.g., BTC, ETH, USDT). Note: Changing symbol is not recommended.',
    example: 'BTC',
    minLength: 2,
    maxLength: 16,
    pattern: '^[A-Z0-9]+$',
  })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Symbol must contain only uppercase letters and numbers',
  })
  symbol?: string;

  @ApiPropertyOptional({
    description: 'Currency full name',
    example: 'Bitcoin',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Decimal precision scale',
    example: 8,
    minimum: 0,
    maximum: 18,
  })
  @IsInt()
  @Min(0)
  @Max(18)
  @IsOptional()
  precisionScale?: number;

  @ApiPropertyOptional({
    description: 'Minimum withdrawal amount',
    example: '0.001',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'minWithdraw must be a valid decimal number with up to 18 decimal places',
  })
  minWithdraw?: string;

  @ApiPropertyOptional({
    description: 'Is currency tradable',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isTradable?: boolean;

  @ApiPropertyOptional({
    description: 'Is currency active',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
