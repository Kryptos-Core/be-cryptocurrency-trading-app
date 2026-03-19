import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SweepWalletDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mainWalletId?: string;
}
