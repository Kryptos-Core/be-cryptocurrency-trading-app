import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export type AdjustmentType = 'DEPOSIT' | 'WITHDRAW';

/**
 * DTO cho thao tác điều chỉnh số dư ví thủ công bởi admin/risk officer.
 */
export class AdminAdjustWalletDto {
  @ApiProperty({
    description: 'UUID của người dùng được điều chỉnh số dư',
    example: '018e9a7b-0001-7abc-8000-000000000001',
  })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({
    description: 'UUID của loại tiền tệ',
    example: '018e9a7b-1234-7abc-8000-000000000002',
  })
  @IsUUID()
  @IsNotEmpty()
  currencyId!: string;

  @ApiProperty({
    description: 'Số tiền điều chỉnh (số dương, tối đa 18 chữ số thập phân)',
    example: '100.5',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount phải là số thập phân dương, tối đa 18 chữ số sau dấu phẩy',
  })
  amount!: string;

  @ApiProperty({
    description: 'Loại điều chỉnh: DEPOSIT (nạp vào) hoặc WITHDRAW (rút ra)',
    enum: ['DEPOSIT', 'WITHDRAW'],
    example: 'DEPOSIT',
  })
  @IsEnum(['DEPOSIT', 'WITHDRAW'])
  type!: AdjustmentType;

  @ApiPropertyOptional({
    description: 'Ghi chú lý do điều chỉnh (tối đa 500 ký tự)',
    example: 'Bù lỗi giao dịch tháng 3/2026',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}

/**
 * DTO trả về sau khi tạo điều chỉnh thành công.
 */
export class AdminAdjustWalletResponseDto {
  @ApiProperty() adjustmentId!: string;
  @ApiProperty() actorUserId!: string;
  @ApiProperty() targetUserId!: string;
  @ApiProperty() currencyId!: string;
  @ApiProperty() amount!: string;
  @ApiProperty({ enum: ['DEPOSIT', 'WITHDRAW'] }) type!: AdjustmentType;
  @ApiPropertyOptional() note!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional() actorEmail?: string;
  @ApiPropertyOptional() targetEmail?: string;
  @ApiPropertyOptional() currencySymbol?: string;
}
