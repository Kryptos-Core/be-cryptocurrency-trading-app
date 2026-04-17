import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SweepWalletDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mainWalletId?: string;

  /** NATIVE = sweep native coin; USDT_TRC20 = sweep all TRC-20 USDT (Tron only). */
  @IsOptional()
  @IsString()
  @IsIn(['NATIVE', 'USDT_TRC20'])
  asset?: 'NATIVE' | 'USDT_TRC20';
}
