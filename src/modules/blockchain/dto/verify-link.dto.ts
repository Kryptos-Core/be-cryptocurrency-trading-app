import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

/** Xác minh liên kết ví — bước 2: gửi chữ ký */
export class VerifyLinkDto {
  @ApiProperty({
    description: 'Mạng blockchain',
    enum: BlockchainNetwork,
    example: BlockchainNetwork.ETH_MAINNET,
  })
  @IsEnum(BlockchainNetwork)
  chain!: BlockchainNetwork;

  @ApiProperty({
    description: 'Địa chỉ ví on-chain',
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
  })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({
    description: 'Chữ ký từ ví (MetaMask/TronLink/Phantom)',
    example: '0xabcdef...',
  })
  @IsString()
  @IsNotEmpty()
  signature!: string;
}
