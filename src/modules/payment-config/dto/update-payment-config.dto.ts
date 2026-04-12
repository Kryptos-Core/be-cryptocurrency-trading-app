import { IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdatePaymentConfigDto {
  @IsOptional()
  @IsString()
  display_name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  grace_period_minutes?: number;

  @IsOptional()
  @IsInt()
  sort_order?: number;
}
