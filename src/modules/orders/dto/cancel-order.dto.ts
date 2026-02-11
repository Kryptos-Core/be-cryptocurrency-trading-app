import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Cancel Order DTO
 * Optional idempotency key for cancel request
 */
export class CancelOrderDto {
  @ApiPropertyOptional({
    description: 'Idempotency key for cancel request (optional)',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;
}
