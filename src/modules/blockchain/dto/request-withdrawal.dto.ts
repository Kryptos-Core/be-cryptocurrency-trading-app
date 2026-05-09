import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';

/** Asset type for withdrawal: NATIVE (TRX/ETH/SOL) or USDT_TRC20 (Tron only) */
export enum WithdrawalAsset {
  NATIVE = 'NATIVE',
  USDT_TRC20 = 'USDT_TRC20',
}

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
    description: 'Loại tài sản rút: NATIVE (TRX/ETH/SOL) hoặc USDT_TRC20 (Tron). Mặc định: NATIVE',
    enum: WithdrawalAsset,
    example: WithdrawalAsset.USDT_TRC20,
  })
  @IsOptional()
  @IsEnum(WithdrawalAsset)
  currency?: WithdrawalAsset;

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
