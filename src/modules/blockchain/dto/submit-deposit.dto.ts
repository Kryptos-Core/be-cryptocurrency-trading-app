import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BlockchainNetwork } from '@/common/enums';

/** Nạp tiền thủ công — user submit txHash đã gửi on-chain */
export class SubmitDepositDto {
  @ApiProperty({
    description: 'Mạng blockchain',
    enum: BlockchainNetwork,
    example: BlockchainNetwork.ETH_SEPOLIA,
  })
  @IsEnum(BlockchainNetwork)
  chain!: BlockchainNetwork;

  @ApiProperty({
    description: 'Transaction hash on-chain',
    example: '0x1234567890abcdef...',
  })
  @IsString()
  @IsNotEmpty()
  txHash!: string;

  @ApiProperty({
    description: 'Số tiền đã gửi (phải khớp với tx on-chain)',
    example: '0.5',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount phải là số decimal hợp lệ',
  })
  amount!: string;
}
