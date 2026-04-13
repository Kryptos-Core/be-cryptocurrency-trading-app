import { IsOptional, IsString, Matches } from 'class-validator';

export class MarketPricesDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9,]+$/)
  symbols?: string;
}
