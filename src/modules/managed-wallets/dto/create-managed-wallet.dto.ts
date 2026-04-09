import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

const MANAGED_TRON_CHAINS = [
  BlockchainNetwork.TRON_MAINNET,
  BlockchainNetwork.TRON_NILE,
  BlockchainNetwork.TRON_SHASTA,
] as const;

export class CreateManagedWalletDto {
  @ApiProperty({
    description: 'Tron family chain (mainnet or testnet)',
    enum: [...MANAGED_TRON_CHAINS],
    example: BlockchainNetwork.TRON_MAINNET,
  })
  @IsIn([...MANAGED_TRON_CHAINS])
  chain!: (typeof MANAGED_TRON_CHAINS)[number];

  @ApiPropertyOptional({
    description: 'Friendly wallet label shown to finance managers',
    example: 'Main treasury wallet',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}
