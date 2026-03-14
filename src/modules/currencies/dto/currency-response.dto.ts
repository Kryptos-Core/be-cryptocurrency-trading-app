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

  // Virtual fields mapped từ Market (Ticker)
  @ApiProperty({ description: 'Giá hiện tại (thường là định giá theo USDT/USD)', example: '69000.50', required: false })
  lastPrice?: string;

  @ApiProperty({ description: 'Phần trăm thay đổi giá trị trong 24h qua', example: '+5.24', required: false })
  priceChangePercent24h?: string;

  @ApiProperty({ description: 'Khối lượng giao dịch trong 24h qua', example: '1250000.00', required: false })
  volume24h?: string;
}
