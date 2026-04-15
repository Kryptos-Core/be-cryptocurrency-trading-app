import { Inject, Injectable } from '@nestjs/common';
import {
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerRepositoryPort,
} from '@/modules/wallets/domain/ports';
import type { WalletLedgerEntryDto } from '@/modules/wallets/dto/wallet-ledger-entry.dto';

@Injectable()
export class GetTransactionHistoryQuery {
  constructor(
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledgerRepo: WalletLedgerRepositoryPort,
  ) {}

  async execute(
    userId: string,
    currencyId: string,
    limit: number = 100,
  ): Promise<WalletLedgerEntryDto[]> {
    const entries = await this.ledgerRepo.findRecentByUserAndCurrency(userId, currencyId, limit);

    const canonicalDirection: Record<string, string> = {
      DEPOSIT: 'CREDIT',
      WITHDRAW: 'DEBIT',
      EXTERNAL_DEPOSIT: 'CREDIT',
      EXTERNAL_WITHDRAWAL: 'DEBIT',
    };

    const seen = new Set<string>();
    const result: WalletLedgerEntryDto[] = [];

    for (const e of entries) {
      const key = `${e.ref_type}:${e.ref_id}`;
      const wantDir = canonicalDirection[e.ref_type] ?? e.direction;
      if (seen.has(key)) continue;
      if (e.direction !== wantDir) continue;
      seen.add(key);
      result.push({
        refType: e.ref_type,
        refId: e.ref_id,
        direction: e.direction,
        amount: String(e.amount),
        createdAt: e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
      });
    }

    return result;
  }
}
