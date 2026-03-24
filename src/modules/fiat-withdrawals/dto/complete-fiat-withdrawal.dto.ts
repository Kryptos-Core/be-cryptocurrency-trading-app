import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CompleteFiatWithdrawalDto {
  @ApiProperty({ description: 'Mã tham chiếu chuyển khoản (sau khi admin đã CK thủ công)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  transferReference!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  adminNote?: string;
}
