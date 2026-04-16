import { Injectable } from '@nestjs/common';
import { DepositsService } from '../../deposits.service';

/**
 * HandleDepositWebhookUseCase — processes incoming PayOS webhook events.
 *
 * Pattern: delegates to DepositsService (thin adapter until Phase 4.2 decomposition).
 */
@Injectable()
export class HandleDepositWebhookUseCase {
  constructor(private readonly depositsService: DepositsService) {}

  async execute(webhookData: unknown): Promise<void> {
    await this.depositsService.handleWebhook(webhookData);
  }
}
