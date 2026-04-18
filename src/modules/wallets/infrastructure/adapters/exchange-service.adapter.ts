import { Injectable } from '@nestjs/common';
import { ExchangeService } from '@/modules/exchange/exchange.service';
import type { ExchangeServicePort } from '@/modules/wallets/domain/ports';

/**
 * Infrastructure Adapter: Exchange Service
 * Wraps the ExchangeService to implement the ExchangeServicePort,
 * converting Decimal values to string at the boundary.
 */
@Injectable()
export class ExchangeServiceAdapter implements ExchangeServicePort {
  constructor(private readonly exchangeService: ExchangeService) {}

  async getBalance(asset: string): Promise<{ available: string; frozen: string }> {
    const balance = await this.exchangeService.getBalance(asset);
    return {
      available: balance.available ? balance.available.toString() : '0',
      frozen: balance.frozen ? balance.frozen.toString() : '0',
    };
  }
}
