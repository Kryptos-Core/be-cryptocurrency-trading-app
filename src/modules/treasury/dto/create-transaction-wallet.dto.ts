import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTransactionWalletDto {
  @IsEnum(['ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET'])
  chain!:
    | 'ETH_SEPOLIA'
    | 'ETH_MAINNET'
    | 'TRON_NILE'
    | 'TRON_SHASTA'
    | 'TRON_MAINNET';

  @IsEnum(['DEPOSIT', 'WITHDRAWAL', 'BOTH'])
  purpose!: 'DEPOSIT' | 'WITHDRAWAL' | 'BOTH';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string;
}
