import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  BLOCKCHAIN_CHAIN_DB_VALUES,
  type BlockchainChainDbValue,
} from '@/common/constants/blockchain-chain-db';

export class ListTreasuryTransactionsDto {
  @IsOptional()
  @IsIn([...BLOCKCHAIN_CHAIN_DB_VALUES])
  chain?: BlockchainChainDbValue;

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
