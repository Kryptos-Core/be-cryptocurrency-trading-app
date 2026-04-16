import { Injectable } from '@nestjs/common';
import type { CreatePaymentConfigDto } from '../../dto';
import { PaymentConfigService } from '../../payment-config.service';

/**
 * CreatePaymentConfigUseCase — delegates to PaymentConfigService (thin adapter).
 */
@Injectable()
export class CreatePaymentConfigUseCase {
  constructor(private readonly paymentConfigService: PaymentConfigService) {}

  async execute(dto: CreatePaymentConfigDto, userId: string) {
    return this.paymentConfigService.createConfig(dto, userId);
  }
}
