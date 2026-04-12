import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

/** Yêu cầu rút tiền — gửi coin từ platform về ví liên kết */
export class RequestWithdrawalDto {
  @ApiProperty({
    description: 'Mạng blockchain',
    enum: BlockchainNetwork,
    example: BlockchainNetwork.ETH_MAINNET,
  })
  @IsEnum(BlockchainNetwork)
  chain!: BlockchainNetwork;

  @ApiProperty({
    description: 'ID ví liên kết đã verified (nhận tiền)',
    example: '019e1a2b-3c4d-7abc-8000-000000000001',
  })
  @IsString()
  @IsNotEmpty()
  linkedWalletId!: string;

  @ApiProperty({
    description: 'Số tiền muốn rút',
    example: '1.5',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount phải là số decimal hợp lệ',
  })
  amount!: string;

  @ApiPropertyOptional({
    description: 'Idempotency key do client gửi để chống submit trùng',
    example: 'withdraw-20260316-0001',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;
}
