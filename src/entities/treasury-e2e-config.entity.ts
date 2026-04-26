import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import {
  BLOCKCHAIN_CHAIN_DB_VALUES,
  type BlockchainChainDbValue,
} from '@/common/constants/blockchain-chain-db';
import {
  DECIMAL_36_18_DEFAULT_ZERO_STRING_COLUMN,
  DECIMAL_36_18_NULLABLE_COLUMN,
} from '@/common/constants/column-types';

export type TreasuryE2EConfigEnvironment = 'development' | 'staging' | 'test' | 'production';
export type TreasuryE2EConfigStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

@Entity('treasury_e2e_configs')
@Index('idx_treasury_e2e_env_status', ['environment', 'status'])
@Index('idx_treasury_e2e_chain', ['chain'])
@Index('idx_treasury_e2e_updated', ['updated_at'])
export class TreasuryE2EConfig {
  @PrimaryColumn({ type: 'char', length: 36 })
  treasury_e2e_config_id!: string;

  @Column({ type: 'varchar', length: 32 })
  environment!: TreasuryE2EConfigEnvironment;

  @Column({ type: 'varchar', length: 128 })
  display_name!: string;

  @Column({ type: 'varchar', length: 512 })
  api_base_url!: string;

  @Column({ type: 'varchar', length: 32 })
  chain!: BlockchainChainDbValue;

  @Column({ type: 'char', length: 36, nullable: true })
  linked_wallet_id!: string | null;

  @Column({ ...DECIMAL_36_18_DEFAULT_ZERO_STRING_COLUMN })
  withdraw_amount_auto!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_ZERO_STRING_COLUMN })
  withdraw_amount_manual!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  deposit_tx_hash!: string | null;

  @Column({ ...DECIMAL_36_18_NULLABLE_COLUMN })
  deposit_amount!: string | null;

  @Column({ type: 'boolean', default: true })
  allow_skip!: boolean;

  @Column({ type: 'boolean', default: false })
  health_fail_on_critical!: boolean;

  @Column({ type: 'int', unsigned: true, default: 15 })
  stale_manual_minutes!: number;

  @Column({ type: 'int', unsigned: true, default: 30 })
  stale_confirming_minutes!: number;

  @Column({ type: 'int', unsigned: true, default: 10 })
  failed_withdrawals_24h!: number;

  @Column({ type: 'int', unsigned: true, default: 100 })
  reconcile_pair_limit!: number;

  @Column({ ...DECIMAL_36_18_DEFAULT_ZERO_STRING_COLUMN })
  reconciliation_threshold!: string;

  @Column({ type: 'text', nullable: true })
  encrypted_secrets!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  trader_user_id!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  risk_user_id!: string | null;

  @Column({ type: 'int', unsigned: true, default: 1 })
  config_version!: number;

  @Column({ type: 'varchar', length: 16, default: 'INACTIVE' })
  status!: TreasuryE2EConfigStatus;

  @Column({ type: 'char', length: 36 })
  created_by!: string;

  @Column({ type: 'char', length: 36 })
  updated_by!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  activated_at!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  archived_at!: Date | null;
}
