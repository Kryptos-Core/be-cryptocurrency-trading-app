import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@/common/exceptions';
import { MarketRepository } from '@/modules/markets/repositories';
import { WalletRepository } from '@/modules/wallets/repositories/wallet.repository';

@Injectable()
export class PrepareCreateOrderContextService {
  constructor(
    private readonly marketRepository: MarketRepository,
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(userId: string, pairId: string) {
    const pair = await this.marketRepository.findById(pairId);
    if (!pair) {
      throw new NotFoundException('Market pair', pairId);
    }

    const quoteWallet = await this.walletRepository.findByUserCurrency(userId, pair.quote_currency_id);
    const baseWallet = await this.walletRepository.findByUserCurrency(userId, pair.base_currency_id);

    return {
      pair,
      availableQuote: quoteWallet?.available ?? '0',
      availableBase: baseWallet?.available ?? '0',
    };
  }
}
