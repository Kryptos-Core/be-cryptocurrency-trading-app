import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewSecurityChangeDto {
  @ApiProperty({ description: 'Approve (true) or reject (false)', example: true })
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({ description: 'Review note (e.g. reason for rejection)', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
