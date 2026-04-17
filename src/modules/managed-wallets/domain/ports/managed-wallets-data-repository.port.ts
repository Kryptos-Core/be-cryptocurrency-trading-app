import type { DeepPartial } from 'typeorm';
import type { OnchainTransaction } from '@/modules/blockchain/entities/onchain-transaction.entity';

export interface ManagedWalletsDataRepositoryPort {
  listOnchainTransactionsForAddress(
    chain: string,
    address: string,
    limit: number,
  ): Promise<OnchainTransaction[]>;
  saveOnchainTransaction(row: DeepPartial<OnchainTransaction>): Promise<void>;
  upsertAppSettingKeyValue(k: string, v: string): Promise<void>;
  findAppSettingValueByKey(k: string): Promise<string | null>;
  aggregateDepositFlagsByNetworkCodes(
    codes: string[],
  ): Promise<Map<string, { deposit_enabled: boolean; min_confirmations: number }>>;
}
