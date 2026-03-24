import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CasCompleteLinkDto {
  @ApiProperty({ description: 'publicToken sau khi user hoàn tất liên kết trên Cas/BankHub' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  publicToken!: string;
}
