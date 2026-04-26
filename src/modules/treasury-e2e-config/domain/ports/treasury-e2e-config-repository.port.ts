import type { TreasuryE2EConfig } from '@/entities/treasury-e2e-config.entity';

export interface TreasuryE2EConfigRepositoryPort {
  findAll(): Promise<Omit<TreasuryE2EConfig, 'encrypted_secrets'>[]>;
  findById(id: string | number): Promise<TreasuryE2EConfig | null>;
  findActiveByEnvironment(environment: string): Promise<TreasuryE2EConfig | null>;
  upsert(payload: {
    configId: string;
    environment: string;
    displayName: string;
    apiBaseUrl: string;
    chain: string;
    linkedWalletId: string | null;
    withdrawAmountAuto: string;
    withdrawAmountManual: string;
    depositTxHash: string | null;
    depositAmount: string | null;
    allowSkip: boolean;
    healthFailOnCritical: boolean;
    staleManualMinutes: number;
    staleConfirmingMinutes: number;
    failedWithdrawals24h: number;
    reconcilePairLimit: number;
    reconciliationThreshold: string;
    encryptedSecrets: string | null;
    traderUserId: string | null;
    riskUserId: string | null;
    userId: string;
  }): Promise<TreasuryE2EConfig>;
  activate(configId: string, environment: string, userId: string): Promise<TreasuryE2EConfig>;
  deactivate(configId: string, userId: string): Promise<TreasuryE2EConfig>;
  archive(configId: string, userId: string): Promise<TreasuryE2EConfig>;
}
