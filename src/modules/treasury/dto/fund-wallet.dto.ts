import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class FundWalletDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount must be a valid decimal string up to 18 decimal places',
  })
  amount!: string;

  /** NATIVE = TRX/ETH/SOL; USDT_TRC20 = TRC-20 USDT (Tron networks only). */
  @IsOptional()
  @IsString()
  @IsIn(['NATIVE', 'USDT_TRC20'])
  asset?: 'NATIVE' | 'USDT_TRC20';
}
