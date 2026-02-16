import { ApiProperty } from '@nestjs/swagger';

/**
 * Wallet Balance DTO
 * Response model for wallet balances
 */
export class WalletBalanceDto {
  @ApiProperty({ description: 'User ID (UUID)', example: '018e9a7b-1234-7abc-8000-000000000001' })
  userId!: string;

  @ApiProperty({ description: 'Currency ID (UUID)', example: '018e9a7b-1234-7abc-8000-000000000002' })
  currencyId!: string;

  @ApiProperty({ description: 'Available balance', example: '100.123456' })
  available!: string;

  @ApiProperty({ description: 'Frozen balance', example: '0.000000' })
  frozen!: string;

  @ApiProperty({ description: 'Total balance (available + frozen)', example: '100.123456' })
  total!: string;
}
