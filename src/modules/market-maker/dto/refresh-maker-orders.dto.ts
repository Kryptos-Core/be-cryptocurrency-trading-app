import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class RefreshMakerOrdersDto {
  @IsOptional()
  @IsString()
  @MaxLength(96)
  refresh_cycle_key?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'order_amount_override must be a valid positive decimal',
  })
  @MaxLength(64)
  order_amount_override?: string;
}
