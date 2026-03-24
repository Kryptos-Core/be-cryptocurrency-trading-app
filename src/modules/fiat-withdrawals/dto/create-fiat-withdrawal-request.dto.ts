import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateFiatWithdrawalRequestDto {
  @ApiProperty({ description: 'ID tài khoản ngân hàng đã verified' })
  @IsString()
  @IsNotEmpty()
  bankAccountId!: string;

  @ApiProperty({ example: '100.50', description: 'Số tiền rút (USDT / platform cash)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,18})?$/, { message: 'amount must be a positive decimal' })
  amount!: string;

  @ApiProperty({ description: 'Khóa idempotent theo client' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(64)
  idempotencyKey!: string;
}
