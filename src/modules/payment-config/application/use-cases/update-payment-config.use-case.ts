import { Injectable } from '@nestjs/common';
import type { UpdatePaymentConfigDto } from '../../dto';
import { PaymentConfigService } from '../../payment-config.service';

/**
 * UpdatePaymentConfigUseCase — delegates to PaymentConfigService (thin adapter).
 */
@Injectable()
export class UpdatePaymentConfigUseCase {
  constructor(private readonly paymentConfigService: PaymentConfigService) {}

  async execute(configId: string, dto: UpdatePaymentConfigDto, userId: string) {
    return this.paymentConfigService.updateConfig(configId, dto, userId);
  }
}
