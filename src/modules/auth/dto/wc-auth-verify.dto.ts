import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BlockchainNetwork } from '@/common/enums';

export class WcAuthVerifyDto {
  @ApiProperty({
    description: 'Session id from POST /auth/wallet/wc/init',
    example: '01900000-0000-7000-8000-000000000001',
  })
  @IsUUID('all', { message: 'sessionId must be a valid UUID' })
  @IsNotEmpty()
  sessionId!: string;

  @ApiProperty({
    description: 'Blockchain network (must match init)',
    enum: BlockchainNetwork,
    example: 'ETH_MAINNET',
  })
  @IsEnum(BlockchainNetwork, { message: 'Chain must be a supported blockchain network' })
  @IsNotEmpty()
  chain!: BlockchainNetwork;

  @ApiProperty({
    description: 'Wallet address that signed the session message',
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({
    description: 'Signature of the exact message returned/stored for this session',
    example: '0x...',
  })
  @IsString()
  @IsNotEmpty()
  signature!: string;
}
