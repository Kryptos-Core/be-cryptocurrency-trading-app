import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreateFiatDepositDto {
  @ApiProperty({ description: 'Amount to deposit in base fiat currency (e.g. VND)' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  amount!: number;
}
