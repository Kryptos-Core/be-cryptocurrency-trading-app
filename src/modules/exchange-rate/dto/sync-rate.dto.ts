import { IsIn, IsString } from 'class-validator';

export class SyncRateDto {
  @IsString()
  @IsIn(['coingecko', 'exchangerate_host'])
  source!: 'coingecko' | 'exchangerate_host';
}
