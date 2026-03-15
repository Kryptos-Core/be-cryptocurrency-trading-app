import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Optional payload cho thao tác approve/reject manual withdrawal */
export class ManualWithdrawalActionDto {
  @ApiPropertyOptional({
    description: 'Lý do reject hoặc ghi chú thao tác manual',
    example: 'Risk check failed',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
