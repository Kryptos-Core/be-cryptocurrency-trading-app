import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFiatDepositDto {
  @ApiProperty({ description: 'Amount to deposit in base fiat currency (e.g. VND)' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  amount!: number;
}
