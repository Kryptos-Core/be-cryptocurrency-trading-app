import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFiatDepositDto {
  @ApiProperty({ description: 'Amount to deposit in base fiat currency (e.g. VND)' })
  @IsInt()
  @Min(10000) // minimum 10000 VND for PayOS
  @Type(() => Number)
  amount!: number;
}
