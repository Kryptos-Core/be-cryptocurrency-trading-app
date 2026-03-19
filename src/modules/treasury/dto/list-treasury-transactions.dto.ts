import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListTreasuryTransactionsDto {
  @IsOptional()
  @IsEnum(['ETH_SEPOLIA', 'TRON_NILE', 'TRON_SHASTA'])
  chain?: 'ETH_SEPOLIA' | 'TRON_NILE' | 'TRON_SHASTA';

  @IsOptional()
  @IsEnum(['SWEEP', 'FUND'])
  type?: 'SWEEP' | 'FUND';

  @IsOptional()
  @IsEnum(['PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED'])
  status?: 'PENDING' | 'CONFIRMING' | 'COMPLETED' | 'FAILED';

  @IsOptional()
  @IsString()
  q?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
