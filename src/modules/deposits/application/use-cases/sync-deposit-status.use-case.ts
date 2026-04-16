import { Injectable } from '@nestjs/common';
import { DepositsService } from '../../deposits.service';

/**
 * SyncDepositStatusUseCase — manually syncs a PayOS deposit status for a user.
 *
 * Useful for reconciliation when webhooks are missed or delayed.
 */
@Injectable()
export class SyncDepositStatusUseCase {
  constructor(private readonly depositsService: DepositsService) {}

  async execute(userId: string, orderCode: number): Promise<void> {
    await this.depositsService.syncPaymentStatusForUser(userId, orderCode);
  }
}
