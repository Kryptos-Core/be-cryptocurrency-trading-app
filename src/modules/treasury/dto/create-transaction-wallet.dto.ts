import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTransactionWalletDto {
  @IsEnum(['ETH_SEPOLIA', 'TRON_NILE', 'TRON_SHASTA'])
  chain!: 'ETH_SEPOLIA' | 'TRON_NILE' | 'TRON_SHASTA';

  @IsEnum(['DEPOSIT', 'WITHDRAWAL', 'BOTH'])
  purpose!: 'DEPOSIT' | 'WITHDRAWAL' | 'BOTH';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string;
}
