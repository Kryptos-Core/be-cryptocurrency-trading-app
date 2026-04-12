import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Create Currency DTO
 * DTO Pattern: Data transfer object for creating currency
 */
export class CreateCurrencyDto {
  @ApiProperty({
    description: 'Currency symbol (e.g., BTC, ETH, USDT)',
    example: 'BTC',
    minLength: 2,
    maxLength: 16,
    pattern: '^[A-Z0-9]+$',
  })
  @IsString()
  @IsNotEmpty({ message: 'Symbol is required' })
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Symbol must contain only uppercase letters and numbers',
  })
  @IsString()
  symbol!: string;

  @ApiProperty({
    description: 'Currency full name',
    example: 'Bitcoin',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Decimal precision scale (default: 8)',
    example: 8,
    minimum: 0,
    maximum: 18,
    default: 8,
  })
  @IsInt()
  @Min(0)
  @Max(18)
  @IsOptional()
  precisionScale?: number = 8;

  @ApiPropertyOptional({
    description: 'Minimum withdrawal amount',
    example: '0.001',
    default: '0',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'minWithdraw must be a valid decimal number with up to 18 decimal places',
  })
  minWithdraw?: string = '0';

  @ApiPropertyOptional({
    description: 'Is currency tradable',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isTradable?: boolean = true;

  @ApiPropertyOptional({
    description: 'Is currency active',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}
