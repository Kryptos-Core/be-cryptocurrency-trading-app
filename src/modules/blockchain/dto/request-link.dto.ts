import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BlockchainNetwork } from '@/common/enums';

/** Yêu cầu liên kết ví — bước 1: tạo nonce challenge */
export class RequestLinkDto {
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

  @ApiPropertyOptional({
    description: 'Tên gợi nhớ cho ví',
    example: 'Ví MetaMask chính',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;
}
