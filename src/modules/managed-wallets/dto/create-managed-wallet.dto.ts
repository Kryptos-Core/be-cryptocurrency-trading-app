import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

export class CreateManagedWalletDto {
  @ApiProperty({
    description: 'Supported Tron testnet chain',
    enum: [BlockchainNetwork.TRON_NILE, BlockchainNetwork.TRON_SHASTA],
    example: BlockchainNetwork.TRON_NILE,
  })
  @IsIn([BlockchainNetwork.TRON_NILE, BlockchainNetwork.TRON_SHASTA])
  chain!: BlockchainNetwork.TRON_NILE | BlockchainNetwork.TRON_SHASTA;

  @ApiPropertyOptional({
    description: 'Friendly wallet label shown to finance managers',
    example: 'Main treasury wallet',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}
