import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletTransactionAction, WalletReferenceType } from '@/common/enums';

/**
 * Wallet Transaction DTO
 * Request model for wallet operations
 */
export class WalletTransactionDto {
  @ApiProperty({ description: 'Currency ID (UUID)', example: '019cedcf-f90f-7917-9a45-000a1fd77709' })
  @IsString()
  @IsNotEmpty({ message: 'currencyId is required' })
  currencyId!: string;

  @ApiProperty({
    description: 'Transaction amount (positive decimal, up to 18 decimals)',
    example: '0.5',
  })
  @IsString()
  @IsNotEmpty({ message: 'amount is required' })
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount must be a valid decimal number with up to 18 decimals',
  })
  amount!: string;

  @ApiProperty({
    description: 'Transaction action',
    enum: WalletTransactionAction,
    example: WalletTransactionAction.CREDIT,
  })
  @IsEnum(WalletTransactionAction)
  action!: WalletTransactionAction;

  @ApiProperty({
    description: 'Reference type for ledger tracking',
    enum: WalletReferenceType,
    example: WalletReferenceType.DEPOSIT,
  })
  @IsEnum(WalletReferenceType)
  refType!: WalletReferenceType;

  @ApiProperty({ description: 'Reference ID (e.g., orderId, tradeId)', example: 1001 })
  @IsInt()
  @Min(1)
  @IsNotEmpty({ message: 'refId is required' })
  refId!: number;

  @ApiPropertyOptional({ description: 'Target user ID (required for TRANSFER)', example: 2 })
  @IsInt()
  @Min(1)
  @IsOptional()
  targetUserId?: number;
}
