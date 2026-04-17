import { Injectable } from '@nestjs/common';
import { DataSource, type DeepPartial } from 'typeorm';
import { AppSetting } from '@/entities/app-setting.entity';
import { CurrencyNetwork } from '@/entities/currency-network.entity';
import { OnchainTransaction } from '@/modules/blockchain';
import type {
  BlockchainOnchainTransactionRecord,
  BlockchainOnchainTransactionWriteInput,
} from '@/modules/blockchain';

export type DepositNetworkAggregateRow = {
  network_code: string;
  deposit_enabled: number | string;
  min_confirmations: number | string;
};

/**
 * Managed-wallets persistence (app settings, on-chain tx list, currency_network aggregates).
 * Keeps `DataSource` usage out of ManagedWalletsService.
 * @see docs/DATA_ACCESS_PATTERNS.md
 */
@Injectable()
export class ManagedWalletsDataRepository {
  constructor(private readonly dataSource: DataSource) {}

  async listOnchainTransactionsForAddress(
    chain: string,
    address: string,
    limit: number,
  ): Promise<BlockchainOnchainTransactionRecord[]> {
    return this.dataSource
      .getRepository(OnchainTransaction)
      .createQueryBuilder('tx')
      .where('tx.chain = :chain', { chain })
      .andWhere('(tx.from_address = :address OR tx.to_address = :address)', { address })
      .orderBy('tx.created_at', 'DESC')
      .limit(limit)
      .getMany();
  }

  async saveOnchainTransaction(row: DeepPartial<BlockchainOnchainTransactionWriteInput>): Promise<void> {
    const repo = this.dataSource.getRepository(OnchainTransaction);
    await repo.save(repo.create(row as DeepPartial<OnchainTransaction>));
  }

  async upsertAppSettingKeyValue(k: string, v: string): Promise<void> {
    await this.dataSource.getRepository(AppSetting).save({ k, v });
  }

  async findAppSettingValueByKey(k: string): Promise<string | null> {
    const row = await this.dataSource.getRepository(AppSetting).findOne({ where: { k } });
    return row?.v ?? null;
  }

  async aggregateDepositFlagsByNetworkCodes(
    codes: string[],
  ): Promise<Map<string, { deposit_enabled: boolean; min_confirmations: number }>> {
    if (codes.length === 0) {
      return new Map();
    }
    const rows = await this.dataSource
      .getRepository(CurrencyNetwork)
      .createQueryBuilder('network')
      .select('network.network_code', 'network_code')
      .addSelect('MAX(CASE WHEN network.deposit_enabled THEN 1 ELSE 0 END)', 'deposit_enabled')
      .addSelect('MAX(network.min_confirmations)', 'min_confirmations')
      .where('network.network_code IN (:...codes)', { codes })
      .groupBy('network.network_code')
      .getRawMany<DepositNetworkAggregateRow>();

    return new Map(
      rows.map((row) => [
        row.network_code,
        {
          deposit_enabled: Number(row.deposit_enabled) === 1,
          min_confirmations: Number(row.min_confirmations) || 12,
        },
      ]),
    );
  }
}



