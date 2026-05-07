import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { TreasuryE2EConfig } from '@/entities/treasury-e2e-config.entity';

@Injectable()
export class TreasuryE2EConfigRepository extends BaseRepository<TreasuryE2EConfig> {
  constructor(dataSource: DataSource) {
    super(TreasuryE2EConfig, dataSource);
  }

  async findAll(): Promise<Omit<TreasuryE2EConfig, 'encrypted_secrets'>[]> {
    const rows = await this.dataSource.query(
      `SELECT treasury_e2e_config_id, environment, display_name, api_base_url, chain, linked_wallet_id,
              withdraw_amount_auto, withdraw_amount_manual, deposit_tx_hash, deposit_amount,
              allow_skip, health_fail_on_critical, stale_manual_minutes, stale_confirming_minutes,
              failed_withdrawals_24h, reconcile_pair_limit, reconciliation_threshold,
              trader_user_id, risk_user_id,
              config_version, status, created_by, updated_by, created_at, updated_at, activated_at, archived_at
         FROM treasury_e2e_configs
        ORDER BY environment ASC, status ASC, updated_at DESC`,
    );
    return rows as Array<Omit<TreasuryE2EConfig, 'encrypted_secrets'>>;
  }

  async findActiveByEnvironment(environment: string): Promise<TreasuryE2EConfig | null> {
    const rows = await this.dataSource.query(
      `SELECT * FROM treasury_e2e_configs WHERE environment = $1 AND status = 'ACTIVE' LIMIT 1`,
      [environment],
    );
    return (rows?.[0] as TreasuryE2EConfig | undefined) ?? null;
  }

  async upsert(payload: {
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
  }): Promise<TreasuryE2EConfig> {
    const existing = await this.findById(payload.configId);
    if (existing) {
      const rows = await this.dataSource.query(
        `UPDATE treasury_e2e_configs
            SET environment = $2,
                display_name = $3,
                api_base_url = $4,
                chain = $5,
                linked_wallet_id = $6,
                withdraw_amount_auto = $7,
                withdraw_amount_manual = $8,
                deposit_tx_hash = $9,
                deposit_amount = $10,
                allow_skip = $11,
                health_fail_on_critical = $12,
                stale_manual_minutes = $13,
                stale_confirming_minutes = $14,
                failed_withdrawals_24h = $15,
                reconcile_pair_limit = $16,
                reconciliation_threshold = $17,
                encrypted_secrets = $18,
                trader_user_id = $19,
                risk_user_id = $20,
                updated_by = $21,
                config_version = config_version + 1,
                updated_at = NOW()
          WHERE treasury_e2e_config_id = $1
          RETURNING *`,
        [
          payload.configId,
          payload.environment,
          payload.displayName,
          payload.apiBaseUrl,
          payload.chain,
          payload.linkedWalletId,
          payload.withdrawAmountAuto,
          payload.withdrawAmountManual,
          payload.depositTxHash,
          payload.depositAmount,
          payload.allowSkip,
          payload.healthFailOnCritical,
          payload.staleManualMinutes,
          payload.staleConfirmingMinutes,
          payload.failedWithdrawals24h,
          payload.reconcilePairLimit,
          payload.reconciliationThreshold,
          payload.encryptedSecrets,
          payload.traderUserId,
          payload.riskUserId,
          payload.userId,
        ],
      );
      return rows[0] as TreasuryE2EConfig;
    }

    const rows = await this.dataSource.query(
      `INSERT INTO treasury_e2e_configs (
         treasury_e2e_config_id, environment, display_name, api_base_url, chain, linked_wallet_id,
         withdraw_amount_auto, withdraw_amount_manual, deposit_tx_hash, deposit_amount,
         allow_skip, health_fail_on_critical, stale_manual_minutes, stale_confirming_minutes,
         failed_withdrawals_24h, reconcile_pair_limit, reconciliation_threshold,
         encrypted_secrets, trader_user_id, risk_user_id,
         config_version, status, created_by, updated_by, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16, $17,
         $18, $19, $20,
         1, 'INACTIVE', $21, $21, NOW(), NOW()
       ) RETURNING *`,
      [
        payload.configId,
        payload.environment,
        payload.displayName,
        payload.apiBaseUrl,
        payload.chain,
        payload.linkedWalletId,
        payload.withdrawAmountAuto,
        payload.withdrawAmountManual,
        payload.depositTxHash,
        payload.depositAmount,
        payload.allowSkip,
        payload.healthFailOnCritical,
        payload.staleManualMinutes,
        payload.staleConfirmingMinutes,
        payload.failedWithdrawals24h,
        payload.reconcilePairLimit,
        payload.reconciliationThreshold,
        payload.encryptedSecrets,
        payload.traderUserId,
        payload.riskUserId,
        payload.userId,
      ],
    );
    return rows[0] as TreasuryE2EConfig;
  }

  async activate(
    configId: string,
    environment: string,
    userId: string,
  ): Promise<TreasuryE2EConfig> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE treasury_e2e_configs
            SET status = 'INACTIVE', updated_by = $2, updated_at = NOW()
          WHERE environment = $1 AND status = 'ACTIVE'`,
        [environment, userId],
      );
      await manager.query(
        `UPDATE treasury_e2e_configs
            SET status = 'ACTIVE', activated_at = NOW(), updated_by = $2, updated_at = NOW(), config_version = config_version + 1
          WHERE treasury_e2e_config_id = $1`,
        [configId, userId],
      );
    });
    const updated = await this.findById(configId);
    if (!updated) throw new Error(`Treasury E2E config not found after activate: ${configId}`);
    return updated;
  }

  async deactivate(configId: string, userId: string): Promise<TreasuryE2EConfig> {
    const rows = await this.dataSource.query(
      `UPDATE treasury_e2e_configs
          SET status = 'INACTIVE', updated_by = $2, updated_at = NOW(), config_version = config_version + 1
        WHERE treasury_e2e_config_id = $1
        RETURNING *`,
      [configId, userId],
    );
    return rows[0] as TreasuryE2EConfig;
  }

  async archive(configId: string, userId: string): Promise<TreasuryE2EConfig> {
    const rows = await this.dataSource.query(
      `UPDATE treasury_e2e_configs
          SET status = 'ARCHIVED', archived_at = NOW(), updated_by = $2, updated_at = NOW(), config_version = config_version + 1
        WHERE treasury_e2e_config_id = $1
        RETURNING *`,
      [configId, userId],
    );
    return rows[0] as TreasuryE2EConfig;
  }
}
