import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class PlaceMakerOrdersDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'order_amount_override must be a valid positive decimal',
  })
  @MaxLength(64)
  order_amount_override?: string;
}
