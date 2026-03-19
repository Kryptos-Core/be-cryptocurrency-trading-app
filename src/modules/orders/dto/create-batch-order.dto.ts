import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderDto } from './create-order.dto';

/**
 * Create Batch Order DTO
 * Batches order placement in one request (max 20 orders).
 */
export class CreateBatchOrderDto {
  @ApiProperty({
    description: 'Orders to create in one batch request',
    type: [CreateOrderDto],
    minItems: 1,
    maxItems: 20,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderDto)
  orders!: CreateOrderDto[];
}
