import { ApiProperty } from '@nestjs/swagger';

/**
 * Currency Response DTO
 * DTO Pattern: Data transfer object for currency response
 */
export class CurrencyResponseDto {
  @ApiProperty({ example: 1 })
  currency_id!: number;

  @ApiProperty({ example: 'BTC' })
  symbol!: string;

  @ApiProperty({ example: 'Bitcoin' })
  name!: string;

  @ApiProperty({ example: 8 })
  precision_scale!: number;

  @ApiProperty({ example: '0.001' })
  min_withdraw!: string;

  @ApiProperty({ example: true })
  is_tradable!: boolean;

  @ApiProperty({ example: true })
  is_active!: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  created_at?: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updated_at?: Date;
}
