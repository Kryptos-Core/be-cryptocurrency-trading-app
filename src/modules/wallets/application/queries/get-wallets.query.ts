import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CacheService } from '@/common/services';
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from '@/modules/currencies/domain/ports';
import { mapTradableCurrenciesToSyntheticWalletRows } from '@/modules/wallets/application/helpers/synthetic-zero-wallet-rows';
import { WALLET_REPOSITORY, type WalletRepositoryPort } from '@/modules/wallets/domain/ports';
import type { WalletListItemDto } from '@/modules/wallets/dto/wallet-list-item.dto';

@Injectable()
export class GetWalletsQuery {
  /**
   * Cache-Aside TTL for the wallets list endpoint (seconds).
   * 15s is enough to absorb repetitive tab taps while WS `wallet:balance`
   * pushes realtime updates on top of any cached snapshot.
   */
  private static readonly CACHE_TTL_SEC = 15;

  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    @Inject(CURRENCY_REPOSITORY) private readonly currencyRepo: CurrencyRepositoryPort,
    private readonly cacheService: CacheService,
  ) {}

  async execute(userId: string, includeZero: boolean = true): Promise<WalletListItemDto[]> {
    const cacheKey = `wallets:user:${userId}:z${includeZero ? 1 : 0}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const dbRows = await this.walletRepo.findByUser(userId, includeZero);
        const rows =
          dbRows.length === 0 && includeZero
            ? mapTradableCurrenciesToSyntheticWalletRows(await this.currencyRepo.findTradable())
            : dbRows;
        return rows.map((w) => {
          const available = String(w.available ?? '0');
          const frozen = String(w.frozen ?? '0');
          const total = new Decimal(available).plus(frozen).toString();
          return {
            walletId: w.wallet_id,
            currencyId: w.currency_id,
            symbol: w.currency_symbol ?? '',
            name: w.currency_name ?? '',
            available,
            frozen,
            total,
          };
        });
      },
      GetWalletsQuery.CACHE_TTL_SEC,
    );
  }
}
