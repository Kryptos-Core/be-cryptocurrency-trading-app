import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ManagedWalletResponseDto {
  @ApiProperty({ description: 'Managed wallet ID' })
  walletId!: string;

  @ApiProperty({ description: 'Owner user ID' })
  userId!: string;

  @ApiProperty({ description: 'Blockchain network code', example: 'TRON_MAINNET' })
  chain!: string;

  @ApiProperty({ description: 'Public wallet address' })
  address!: string;

  @ApiProperty({ description: 'Public key used for address derivation' })
  publicKey!: string;

  @ApiPropertyOptional({ description: 'Friendly wallet label' })
  label!: string | null;

  @ApiProperty({ description: 'Whether this wallet is the current default deposit wallet' })
  isDefaultDeposit!: boolean;

  @ApiProperty({ description: 'Whether the wallet is active' })
  isActive!: boolean;

  @ApiPropertyOptional({ description: 'Default assignment timestamp, if any' })
  defaultSetAt!: string | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: string;
}
