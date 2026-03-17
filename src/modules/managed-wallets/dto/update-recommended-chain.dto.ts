import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

export class UpdateRecommendedChainDto {
  @ApiProperty({
    description: 'Recommended chain displayed first on the deposit screen',
    enum: [BlockchainNetwork.TRON_NILE, BlockchainNetwork.TRON_SHASTA],
    example: BlockchainNetwork.TRON_NILE,
  })
  @IsIn([BlockchainNetwork.TRON_NILE, BlockchainNetwork.TRON_SHASTA])
  chain!: BlockchainNetwork.TRON_NILE | BlockchainNetwork.TRON_SHASTA;
}
