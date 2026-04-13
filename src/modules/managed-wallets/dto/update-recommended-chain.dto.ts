import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { BLOCKCHAIN_CHAIN_DB_VALUES } from '@/common/constants/blockchain-chain-db';
import { BlockchainNetwork } from '@/common/enums';

export class UpdateRecommendedChainDto {
  @ApiProperty({
    description:
      'Recommended chain displayed first on the deposit screen; must be one of the chains allowed for the current on-chain operator mode (same list as on-chain deposit / managed-wallets UI).',
    enum: [...BLOCKCHAIN_CHAIN_DB_VALUES],
    example: BlockchainNetwork.TRON_MAINNET,
  })
  @IsIn([...BLOCKCHAIN_CHAIN_DB_VALUES])
  chain!: (typeof BLOCKCHAIN_CHAIN_DB_VALUES)[number];
}
