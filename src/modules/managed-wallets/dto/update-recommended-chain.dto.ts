import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

const MANAGED_TRON_CHAINS = [
  BlockchainNetwork.TRON_MAINNET,
  BlockchainNetwork.TRON_NILE,
  BlockchainNetwork.TRON_SHASTA,
] as const;

export class UpdateRecommendedChainDto {
  @ApiProperty({
    description: 'Recommended chain displayed first on the deposit screen',
    enum: [...MANAGED_TRON_CHAINS],
    example: BlockchainNetwork.TRON_MAINNET,
  })
  @IsIn([...MANAGED_TRON_CHAINS])
  chain!: (typeof MANAGED_TRON_CHAINS)[number];
}
