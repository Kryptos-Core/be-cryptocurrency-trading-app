import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@/common/exceptions';
import { MARKET_REPOSITORY, type MarketRepositoryPort } from '@/modules/markets/domain/ports';
import { WALLET_REPOSITORY, type WalletRepositoryPort } from '@/modules/wallets/domain/ports';

@Injectable()
export class PrepareCreateOrderContextService {
  constructor(
    @Inject(MARKET_REPOSITORY)
    private readonly marketRepository: MarketRepositoryPort,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepositoryPort,
  ) {}

  async execute(userId: string, pairId: string) {
    const pair = await this.marketRepository.findById(pairId);
    if (!pair) {
      throw new NotFoundException('Market pair', pairId);
    }

    const quoteWallet = await this.walletRepository.findByUserCurrency(
      userId,
      pair.quote_currency_id,
    );
    const baseWallet = await this.walletRepository.findByUserCurrency(
      userId,
      pair.base_currency_id,
    );

    return {
      pair,
      availableQuote: quoteWallet?.available ?? '0',
      availableBase: baseWallet?.available ?? '0',
    };
  }
}
