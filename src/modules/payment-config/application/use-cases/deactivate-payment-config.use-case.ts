import { Injectable } from '@nestjs/common';
import { PaymentConfigService } from '../../payment-config.service';

/**
 * DeactivatePaymentConfigUseCase — delegates to PaymentConfigService (thin adapter).
 */
@Injectable()
export class DeactivatePaymentConfigUseCase {
  constructor(private readonly paymentConfigService: PaymentConfigService) {}

  async execute(configId: string, userId: string): Promise<{ success: boolean }> {
    return this.paymentConfigService
      .deactivateConfig(configId, userId)
      .then(() => ({ success: true }));
  }
}
