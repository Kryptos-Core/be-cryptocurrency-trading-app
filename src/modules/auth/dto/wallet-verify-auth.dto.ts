import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

export class WalletVerifyAuthDto {
  @ApiProperty({
    description: 'Blockchain network',
    enum: BlockchainNetwork,
    example: 'ETH_MAINNET',
  })
  @IsEnum(BlockchainNetwork, { message: 'Chain must be a supported blockchain network' })
  @IsNotEmpty({ message: 'Chain is required' })
  chain!: BlockchainNetwork;

  @ApiProperty({
    description: 'Wallet address',
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  })
  @IsString()
  @IsNotEmpty({ message: 'Address is required' })
  address!: string;

  @ApiProperty({
    description: 'Signature from wallet (personal_sign / Tron message sign)',
    example: '0x...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Signature is required' })
  signature!: string;
}
