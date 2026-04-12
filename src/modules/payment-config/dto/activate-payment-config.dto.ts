import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ActivatePaymentConfigDto {
  /**
   * Override grace period in minutes for this activation.
   * If omitted, the config's own grace_period_minutes value is used.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  grace_period_minutes?: number;
}
