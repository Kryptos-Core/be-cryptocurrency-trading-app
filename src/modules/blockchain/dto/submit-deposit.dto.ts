import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

/** Nạp tiền — user submit txHash; amount có thể bỏ trống để hệ thống lấy đúng số on-chain đã resolve. */
export class SubmitDepositDto {
  @ApiProperty({
    description: 'Mạng blockchain',
    enum: BlockchainNetwork,
    example: BlockchainNetwork.ETH_MAINNET,
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

  @ApiPropertyOptional({
    description:
      'Số tiền đã gửi (tuỳ chọn — nếu gửi phải khớp với số on-chain đã resolve; bỏ trống = dùng số on-chain)',
    example: '0.5',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount phải là số decimal hợp lệ',
  })
  amount?: string;
}
