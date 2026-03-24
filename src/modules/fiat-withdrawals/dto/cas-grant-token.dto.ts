import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CasGrantTokenDto {
  @ApiPropertyOptional({ example: 'vi', description: 'Ngôn ngữ giao diện Cas Link' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  language?: string;
}
