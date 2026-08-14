import { Inject, Injectable } from '@nestjs/common';
import type { WalletBalanceDto } from '@/modules/wallets/dto/wallet-balance.dto';
import { CacheService } from '@/common/services';
import { WALLET_REPOSITORY, type WalletRepositoryPort } from '@/modules/wallets/domain/ports';
import { BalanceCalculationService } from '@/modules/wallets/domain/services/balance-calculation.service';

@Injectable()
export class GetBalanceQuery {
  /**
   * Cache-Aside TTL for per-currency balance (seconds).
   * Balance is pushed via WS `wallet:balance` so a short TTL is enough to
   * absorb repetitive tab taps without serving stale data.
   */
  private static readonly CACHE_TTL_SEC = 5;

  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    private readonly balanceCalc: BalanceCalculationService,
    private readonly cacheService: CacheService,
  ) {}

  async execute(userId: string, currencyId: string): Promise<WalletBalanceDto> {
    const cacheKey = `wallets:user:${userId}:cur:${currencyId}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
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
      },
      GetBalanceQuery.CACHE_TTL_SEC,
    );
  }
}
