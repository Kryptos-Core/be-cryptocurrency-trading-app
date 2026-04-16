import { Injectable } from '@nestjs/common';
import { PaymentConfigService } from '../../payment-config.service';

/**
 * GetPaymentConfigsQuery — read-only queries for payment config data.
 *
 * Thin wrapper around PaymentConfigService following CQS principle.
 */
@Injectable()
export class GetPaymentConfigsQuery {
  constructor(private readonly paymentConfigService: PaymentConfigService) {}

  async list() {
    return this.paymentConfigService.listConfigs();
  }

  async getFormOptions() {
    return this.paymentConfigService.getFormOptions();
  }

  async getConfigByIdForEdit(configId: string) {
    return this.paymentConfigService.getConfigByIdForEdit(configId);
  }
}
