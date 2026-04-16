import { Injectable } from '@nestjs/common';
import { DepositsService } from '../../deposits.service';

export interface CreateDepositLinkResult {
  checkoutUrl: string;
  orderCode: number;
  depositId: string;
}

/**
 * CreateDepositLinkUseCase — delegates to the DepositsService (thin adapter).
 *
 * This use-case exists to make the deposits module conform to the Clean Architecture
 * application layer pattern. The actual PayOS orchestration lives in DepositsService
 * until Phase 4.2 decomposes it further.
 */
@Injectable()
export class CreateDepositLinkUseCase {
  constructor(private readonly depositsService: DepositsService) {}

  async execute(
    userId: string,
    amount: number,
  ): Promise<{ checkoutUrl: string; orderCode: number }> {
    return this.depositsService.createPaymentLink(userId, amount);
  }
}
