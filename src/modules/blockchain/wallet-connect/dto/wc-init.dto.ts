import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

const EVM_CHAINS = [
  BlockchainNetwork.ETH_SEPOLIA,
  BlockchainNetwork.SOLANA_DEVNET,
] as const;

export class WcInitDto {
  @ApiProperty({
    enum: EVM_CHAINS,
    example: BlockchainNetwork.ETH_SEPOLIA,
    description: 'Mạng blockchain EVM cần liên kết ví qua WalletConnect',
  })
  @IsEnum(BlockchainNetwork)
  chain!: BlockchainNetwork;
}
