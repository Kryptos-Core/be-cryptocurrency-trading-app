import { Injectable } from '@nestjs/common';
import { DepositsService } from '../../deposits.service';

export interface DepositCheckoutMeta {
  fiatSymbol: string;
  minAmount: number;
  maxAmount: number | undefined;
}

/**
 * GetDepositPreviewQuery — returns a preview of what the user will receive before confirming.
 *
 * Used by the UI to show conversion estimates before submitting.
 */
@Injectable()
export class GetDepositPreviewQuery {
  constructor(private readonly depositsService: DepositsService) {}

  async execute(amount: string, fiatSymbol?: string): Promise<object> {
    return this.depositsService.getDepositPreview(amount, fiatSymbol);
  }

  async getCheckoutMeta(): Promise<DepositCheckoutMeta> {
    return this.depositsService.getCheckoutMeta();
  }
}
