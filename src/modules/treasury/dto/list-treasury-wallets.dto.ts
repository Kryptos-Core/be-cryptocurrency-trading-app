import { IsEnum, IsOptional } from 'class-validator';

export class ListTreasuryWalletsDto {
  @IsOptional()
  @IsEnum(['ETH_SEPOLIA', 'TRON_NILE', 'TRON_SHASTA'])
  chain?: 'ETH_SEPOLIA' | 'TRON_NILE' | 'TRON_SHASTA';

  @IsOptional()
  @IsEnum(['DEPOSIT', 'WITHDRAWAL', 'BOTH'])
  purpose?: 'DEPOSIT' | 'WITHDRAWAL' | 'BOTH';
}
