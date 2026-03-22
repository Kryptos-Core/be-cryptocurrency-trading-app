import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { PaymentMethodConfig, PaymentMethodStatus, PaymentMethodType } from '@/entities/payment-method-config.entity';

@Injectable()
export class PaymentConfigRepository extends BaseRepository<PaymentMethodConfig> {
  constructor(dataSource: DataSource) {
    super(PaymentMethodConfig, dataSource);
  }

  async findActive(type: PaymentMethodType, network: string): Promise<PaymentMethodConfig | null> {
    const rows = await this.dataSource.query<PaymentMethodConfig[]>(
      'CALL sp_payment_config_find_active(?, ?)',
      [type, network],
    );
    const result = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
    return result ?? null;
  }

  async findAll(): Promise<Omit<PaymentMethodConfig, 'encrypted_config'>[]> {
    const rows = await this.dataSource.query<PaymentMethodConfig[]>(
      'CALL sp_payment_config_list()',
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
      'CALL sp_payment_config_upsert(?, ?, ?, ?, ?, ?, ?, ?)',
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
      'CALL sp_payment_config_set_status(?, ?, ?)',
      [configId, status, userId],
    );
    const result = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
    return result as PaymentMethodConfig;
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
