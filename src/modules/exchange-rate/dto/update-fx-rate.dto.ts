import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateFxRateDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/)
  fiatToQuoteRate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,3}|10000)$/)
  fxSpreadBps?: string;

  @IsOptional()
  @IsBoolean()
  autoSync?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  autoSyncIntervalMinutes?: number;

  @IsOptional()
  @IsString()
  @IsIn(['coingecko', 'exchangerate_host'])
  autoSyncSource?: 'coingecko' | 'exchangerate_host';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.1)
  @Max(100)
  rateChangeAlertThresholdPct?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
