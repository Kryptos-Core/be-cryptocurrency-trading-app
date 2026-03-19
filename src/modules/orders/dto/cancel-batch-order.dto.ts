import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Cancel Batch Order DTO
 * Cancels multiple orders owned by current user (max 20 orders).
 */
export class CancelBatchOrderDto {
  @ApiProperty({
    description: 'Order IDs to cancel',
    type: [String],
    minItems: 1,
    maxItems: 20,
    example: ['018e9a7b-1234-7abc-8000-000000000001'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  orderIds!: string[];

  @ApiPropertyOptional({
    description: 'Idempotency key for batch cancel request (optional)',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;
}
