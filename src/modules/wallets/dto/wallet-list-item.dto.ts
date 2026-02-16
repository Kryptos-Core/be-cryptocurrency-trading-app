import { ApiProperty } from '@nestjs/swagger';

/**
 * Wallet list item (one wallet with currency info)
 */
export class WalletListItemDto {
  @ApiProperty({ description: 'Wallet ID (UUID)' })
  walletId!: string;

  @ApiProperty({ description: 'Currency ID (UUID)' })
  currencyId!: string;

  @ApiProperty({ description: 'Currency symbol', example: 'BTC' })
  symbol!: string;

  @ApiProperty({ description: 'Currency name', example: 'Bitcoin' })
  name!: string;

  @ApiProperty({ description: 'Available balance' })
  available!: string;

  @ApiProperty({ description: 'Frozen balance' })
  frozen!: string;

  @ApiProperty({ description: 'Total (available + frozen)' })
  total!: string;
}
