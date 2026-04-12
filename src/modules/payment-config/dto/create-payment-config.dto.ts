import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type { PaymentMethodType } from '@/entities/payment-method-config.entity';

export class CreatePaymentConfigDto {
  @IsEnum(['PAYOS', 'ETH', 'TRON', 'SOL', 'BSC'])
  type!: PaymentMethodType;

  @IsString()
  @IsNotEmpty()
  network!: string;

  @IsString()
  @IsNotEmpty()
  display_name!: string;

  /**
   * Raw config object — will be encrypted by the service before storing.
   * Shape depends on `type`: PayosGatewayConfig or BlockchainGatewayConfig.
   */
  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  grace_period_minutes?: number;

  @IsOptional()
  @IsInt()
  sort_order?: number;
}
