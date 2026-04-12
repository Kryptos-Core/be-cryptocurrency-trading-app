import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

export class WcAuthInitDto {
  @ApiProperty({
    description: 'Blockchain network for WalletConnect session',
    enum: BlockchainNetwork,
    example: 'ETH_MAINNET',
  })
  @IsEnum(BlockchainNetwork, { message: 'Chain must be a supported blockchain network' })
  @IsNotEmpty({ message: 'Chain is required' })
  chain!: BlockchainNetwork;
}
