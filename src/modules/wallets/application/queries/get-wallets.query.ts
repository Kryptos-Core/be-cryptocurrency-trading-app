import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { WALLET_REPOSITORY, type WalletRepositoryPort } from '@/modules/wallets/domain/ports';
import type { WalletListItemDto } from '@/modules/wallets/dto/wallet-list-item.dto';

@Injectable()
export class GetWalletsQuery {
  constructor(@Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort) {}

  async execute(userId: string, includeZero: boolean = true): Promise<WalletListItemDto[]> {
    const rows = await this.walletRepo.findByUser(userId, includeZero);
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
  }
}
