import { Injectable } from '@nestjs/common';
import type { ActivatePaymentConfigDto } from '../../dto';
import { PaymentConfigService } from '../../payment-config.service';

/**
 * ActivatePaymentConfigUseCase — delegates to PaymentConfigService (thin adapter).
 */
@Injectable()
export class ActivatePaymentConfigUseCase {
  constructor(private readonly paymentConfigService: PaymentConfigService) {}

  async execute(configId: string, dto: ActivatePaymentConfigDto, userId: string) {
    return this.paymentConfigService.activateWithGracePeriod(configId, dto, userId);
  }
}
