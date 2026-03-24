import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class ResolveBankAccountHolderDto {
  @ApiProperty({ example: 'VCB', description: 'Mã ngân hàng (VIETNAM_BANKS)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  bankCode!: string;

  @ApiProperty({ example: '0123456789012', description: 'Số tài khoản (chỉ chữ số)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6,19}$/, { message: 'accountNumber must be 6–19 digits' })
  accountNumber!: string;
}
