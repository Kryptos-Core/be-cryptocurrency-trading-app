import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

const WC_LINK_CHAINS = Object.values(BlockchainNetwork) as BlockchainNetwork[];

export class WcInitDto {
  @ApiProperty({
    enum: WC_LINK_CHAINS,
    example: BlockchainNetwork.ETH_MAINNET,
    description:
      'Mạng blockchain (mainnet hoặc sandbox) để liên kết ví qua WalletConnect — khớp enum backend.',
  })
  @IsIn(WC_LINK_CHAINS)
  chain!: BlockchainNetwork;
}
