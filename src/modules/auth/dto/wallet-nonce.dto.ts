import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

export class WalletNonceDto {
  @ApiProperty({
    description:
      'Blockchain network (mainnet: ETH_MAINNET, BSC_MAINNET, TRON_MAINNET, SOLANA_MAINNET)',
    enum: BlockchainNetwork,
    example: 'ETH_MAINNET',
  })
  @IsEnum(BlockchainNetwork, { message: 'Chain must be a supported blockchain network' })
  @IsNotEmpty({ message: 'Chain is required' })
  chain!: BlockchainNetwork;

  @ApiProperty({
    description: 'Wallet address (0x... for Ethereum, T... for Tron)',
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  })
  @IsString()
  @IsNotEmpty({ message: 'Address is required' })
  address!: string;
}
