import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PAYMENT_CONFIG_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { BaseRepository } from '@/common/repositories';
import { PaymentMethodConfig, PaymentMethodStatus, PaymentMethodType } from '@/entities/payment-method-config.entity';

@Injectable()
export class PaymentConfigRepository extends BaseRepository<PaymentMethodConfig> {
  constructor(dataSource: DataSource) {
    super(PaymentMethodConfig, dataSource);
  }

  async findActive(type: PaymentMethodType, network: string): Promise<PaymentMethodConfig | null> {
    const rows = await this.dataSource.query<PaymentMethodConfig[]>(
      `CALL ${PAYMENT_CONFIG_STORE_PROCEDURE.FIND_ACTIVE}(?, ?)`,
      [type, network],
    );
    const result = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
    return result ?? null;
  }

  async findAll(): Promise<Omit<PaymentMethodConfig, 'encrypted_config'>[]> {
    const rows = await this.dataSource.query<PaymentMethodConfig[]>(
      `CALL ${PAYMENT_CONFIG_STORE_PROCEDURE.LIST}()`,
    );
    return Array.isArray(rows[0]) ? rows[0] : rows;
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
    const rows = await this.dataSource.query(
      `CALL ${PAYMENT_CONFIG_STORE_PROCEDURE.UPSERT}(?, ?, ?, ?, ?, ?, ?, ?)`,
      [configId, type, network, displayName, encryptedConfig, gracePeriodMinutes, sortOrder, userId],
    );
    const result = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
    return result as PaymentMethodConfig;
  }

  async setStatus(
    configId: string,
    status: PaymentMethodStatus,
    userId: string,
    manager?: EntityManager,
  ): Promise<PaymentMethodConfig> {
    const exec = manager ?? this.dataSource.manager;
    const rows = await exec.query(
      `CALL ${PAYMENT_CONFIG_STORE_PROCEDURE.SET_STATUS}(?, ?, ?)`,
      [configId, status, userId],
    );
    const result = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
    return result as PaymentMethodConfig;
  }

  /**
   * Configs stuck in TRANSITIONING after grace elapsed (Bull missed/delayed job).
   * Uses DB clock so it matches transition_started_at semantics.
   */
  async findTransitioningPastGrace(): Promise<
    Array<{
      config_id: string;
      type: PaymentMethodType;
      network: string;
      updated_by: string;
    }>
  > {
    const rows = await this.dataSource.query<
      Array<{
        config_id: string;
        type: PaymentMethodType;
        network: string;
        updated_by: string;
      }>
    >(
      `SELECT config_id, type, network, updated_by
       FROM payment_method_configs
       WHERE status = 'TRANSITIONING'
         AND transition_started_at IS NOT NULL
         AND TIMESTAMPDIFF(MINUTE, transition_started_at, NOW()) >= grace_period_minutes`,
    );
    return rows ?? [];
  }

  /** Count PENDING onchain transactions and fiat deposits that may be affected by a config switch */
  async countPendingTransactions(): Promise<number> {
    const [onchainRow] = await this.dataSource.query<[{ cnt: string }]>(
      `SELECT COUNT(*) AS cnt FROM onchain_transactions WHERE status IN ('PENDING','CONFIRMING')`,
    );
    const [fiatRow] = await this.dataSource.query<[{ cnt: string }]>(
      `SELECT COUNT(*) AS cnt FROM fiat_deposits WHERE status = 'PENDING'`,
    );
    return Number(onchainRow.cnt) + Number(fiatRow.cnt);
  }
}
