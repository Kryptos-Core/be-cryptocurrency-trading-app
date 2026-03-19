import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertMarketMakerConfigDto {
  @IsInt()
  @Min(1)
  @Max(10000)
  spread_bps!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20000)
  spread_alert_threshold_bps?: number;

  @IsString()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'order_amount must be a valid positive decimal',
  })
  @MaxLength(64)
  order_amount!: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'stop_loss_pct must be a valid positive decimal with max 4 decimals',
  })
  @MaxLength(32)
  stop_loss_pct?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'max_position_base must be a valid positive decimal',
  })
  @MaxLength(64)
  max_position_base?: string | null;
}
