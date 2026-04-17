import type { DeepPartial } from 'typeorm';
import type {
  BlockchainOnchainTransactionRecord,
  BlockchainOnchainTransactionWriteInput,
} from '@/modules/blockchain';

export interface ManagedWalletsDataRepositoryPort {
  listOnchainTransactionsForAddress(
    chain: string,
    address: string,
    limit: number,
  ): Promise<BlockchainOnchainTransactionRecord[]>;
  saveOnchainTransaction(row: DeepPartial<BlockchainOnchainTransactionWriteInput>): Promise<void>;
  upsertAppSettingKeyValue(k: string, v: string): Promise<void>;
  findAppSettingValueByKey(k: string): Promise<string | null>;
  aggregateDepositFlagsByNetworkCodes(
    codes: string[],
  ): Promise<Map<string, { deposit_enabled: boolean; min_confirmations: number }>>;
}



