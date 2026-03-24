import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateBankAccountDto {
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

  @ApiProperty({ example: 'NGUYEN VAN A', description: 'Tên chủ tài khoản (khớp giấy tờ / KYC)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  @Matches(/^[A-Za-zÀ-ỹ0-9\s.\-']+$/u, {
    message: 'accountHolderName contains invalid characters',
  })
  accountHolderName!: string;
}
