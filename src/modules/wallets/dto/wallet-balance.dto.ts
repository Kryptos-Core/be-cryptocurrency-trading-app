import { ApiProperty } from '@nestjs/swagger';

/**
 * Wallet Balance DTO
 * Response model for wallet balances
 */
export class WalletBalanceDto {
  @ApiProperty({ description: 'User ID', example: 1 })
  userId!: number;

  @ApiProperty({ description: 'Currency ID', example: 1 })
  currencyId!: number;

  @ApiProperty({ description: 'Available balance', example: '100.123456' })
  available!: string;

  @ApiProperty({ description: 'Frozen balance', example: '0.000000' })
  frozen!: string;

  @ApiProperty({ description: 'Total balance (available + frozen)', example: '100.123456' })
  total!: string;
}
