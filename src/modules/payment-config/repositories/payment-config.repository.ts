import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import {
  PaymentMethodConfig,
  type PaymentMethodStatus,
  type PaymentMethodType,
} from '@/entities/payment-method-config.entity';


@Injectable()
export class PaymentConfigRepository extends BaseRepository<PaymentMethodConfig> {
  constructor(dataSource: DataSource) {
    super(PaymentMethodConfig, dataSource);
  }

  async findActive(type: PaymentMethodType, network: string): Promise<PaymentMethodConfig | null> {
    const rows = await this.dataSource.query(
      `SELECT *
       FROM payment_method_configs
       WHERE type = $1 AND network = $2 AND status = 'ACTIVE'
       ORDER BY sort_order ASC, updated_at DESC
       LIMIT 1`,
      [type, network],
    );
    return (rows?.[0] as PaymentMethodConfig | undefined) ?? null;
  }

  async findAll(): Promise<Omit<PaymentMethodConfig, 'encrypted_config'>[]> {
    const rows = await this.dataSource.query(
      `SELECT config_id, type, network, display_name, config_version, status,
              grace_period_minutes, transition_started_at, activated_at,
              sort_order, created_by, updated_by, created_at, updated_at
       FROM payment_method_configs
       ORDER BY type ASC, network ASC, sort_order ASC, updated_at DESC`,
    );
    return rows as Array<Omit<PaymentMethodConfig, 'encrypted_config'>>;
  }

  async upsert(
    configId: string,
    type: PaymentMethodType,
    network: string,
    displayName: string,
    encryptedConfig: string,
    gracePeriodMinutes: number,
    sortOrder: number,
    userId: string,
  ): Promise<PaymentMethodConfig> {
    const existing = await this.findById(configId);
    if (existing) {
      const rows = await this.dataSource.query(
        `UPDATE payment_method_configs
         SET display_name = $2,
             encrypted_config = $3,
             grace_period_minutes = $4,
             sort_order = $5,
             updated_by = $6,
             config_version = config_version + 1,
             updated_at = NOW()
         WHERE config_id = $1
         RETURNING *`,
        [configId, displayName, encryptedConfig, gracePeriodMinutes, sortOrder, userId],
      );
      return rows[0] as PaymentMethodConfig;
    }

    const rows = await this.dataSource.query(
      `INSERT INTO payment_method_configs (
         config_id, type, network, display_name, encrypted_config, config_version,
         status, grace_period_minutes, transition_started_at, activated_at,
         sort_order, created_by, updated_by, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 1,
         'INACTIVE', $6, NULL, NULL,
         $7, $8, $8, NOW(), NOW()
       )
       RETURNING *`,
      [configId, type, network, displayName, encryptedConfig, gracePeriodMinutes, sortOrder, userId],
    );
    return rows[0] as PaymentMethodConfig;
  }

  async setStatus(
    configId: string,
    status: PaymentMethodStatus,
    userId: string,
    manager?: EntityManager,
  ): Promise<PaymentMethodConfig> {
    const exec = manager ?? this.dataSource.manager;
    const rows = await exec.query(
      `UPDATE payment_method_configs
       SET status = $2,
           updated_by = $3,
           transition_started_at = CASE WHEN $2 = 'TRANSITIONING' THEN NOW() ELSE transition_started_at END,
           activated_at = CASE WHEN $2 = 'ACTIVE' THEN NOW() ELSE activated_at END,
           config_version = config_version + 1,
           updated_at = NOW()
       WHERE config_id = $1
       RETURNING *`,
      [configId, status, userId],
    );
    return rows[0] as PaymentMethodConfig;
  }

  async findTransitioningPastGrace(): Promise<
    Array<{
      config_id: string;
      type: PaymentMethodType;
      network: string;
      updated_by: string;
    }>
  > {
    const rows = await this.dataSource.query(
      `SELECT config_id, type, network, updated_by
       FROM payment_method_configs
       WHERE status = 'TRANSITIONING'
         AND transition_started_at IS NOT NULL
         AND EXTRACT(EPOCH FROM (NOW() - transition_started_at)) / 60 >= grace_period_minutes`,
    );
    return rows ?? [];
  }

  async countPendingTransactions(): Promise<number> {
    const [onchainRow] = await this.dataSource.query<[{ cnt: string }]>(
      `SELECT COUNT(*)::text AS cnt FROM onchain_transactions WHERE status IN ('PENDING','CONFIRMING')`,
    );
    const [fiatRow] = await this.dataSource.query<[{ cnt: string }]>(
      `SELECT COUNT(*)::text AS cnt FROM fiat_deposits WHERE status = 'PENDING'`,
    );
    return Number(onchainRow.cnt) + Number(fiatRow.cnt);
  }
}
