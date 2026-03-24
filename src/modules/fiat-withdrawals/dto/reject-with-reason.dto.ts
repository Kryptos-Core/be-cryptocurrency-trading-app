import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectWithReasonDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
