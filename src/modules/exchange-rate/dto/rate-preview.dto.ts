import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class RatePreviewDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?$/)
  fiatAmount!: string;

  @IsOptional()
  @IsString()
  fiatSymbol?: string;
}
