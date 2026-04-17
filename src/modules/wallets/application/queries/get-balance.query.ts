import { Inject, Injectable } from '@nestjs/common';
import { WALLET_REPOSITORY, type WalletRepositoryPort } from '@/modules/wallets/domain/ports';
import { BalanceCalculationService } from '@/modules/wallets/domain/services/balance-calculation.service';
import type { WalletBalanceDto } from '@/modules/wallets/dto/wallet-balance.dto';

@Injectable()
export class GetBalanceQuery {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    private readonly balanceCalc: BalanceCalculationService,
  ) {}

  async execute(userId: string, currencyId: string): Promise<WalletBalanceDto> {
    const wallet = await this.walletRepo.findByUserCurrency(userId, currencyId);
    if (!wallet) {
      return this.balanceCalc.buildBalanceSnapshot(userId, currencyId, '0', '0');
    }
    return this.balanceCalc.buildBalanceSnapshot(
      userId,
      currencyId,
      wallet.available ?? '0',
      wallet.frozen ?? '0',
    );
  }
}
