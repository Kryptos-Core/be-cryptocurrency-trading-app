import { IsEnum, IsOptional } from 'class-validator';

export class ListTreasuryWalletsDto {
  @IsOptional()
  @IsEnum(['ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET'])
  chain?:
    | 'ETH_SEPOLIA'
    | 'ETH_MAINNET'
    | 'TRON_NILE'
    | 'TRON_SHASTA'
    | 'TRON_MAINNET';

  @IsOptional()
  @IsEnum(['DEPOSIT', 'WITHDRAWAL', 'BOTH'])
  purpose?: 'DEPOSIT' | 'WITHDRAWAL' | 'BOTH';
}
