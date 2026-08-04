import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum ConfigCategory {
  TECH = 'tech', // RPC URLs, Intervals
  FINANCE = 'finance', // Withdraw Max, Transfer Limits, Rate fallbacks
  OPS = 'ops', // Matching engine, Go aggregator, outbox alerts, rollout, market read
  CORE = 'core', // Default symbols, market sources, wallet config
  /** Auth / security toggles: email verification requirement, future auth switches. */
  AUTH_SECURITY = 'auth_security',
}

export enum ConfigDataType {
  STRING = 'string',
  INTEGER = 'int',
  FLOAT = 'float',
  BOOLEAN = 'bool',
}

@Entity('system_configs')
export class SystemConfig {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key!: string; // e.g., BLOCKCHAIN_DEPOSIT_TRX_TO_USDT_RATE

  @Column({ type: 'text' })
  value!: string;

  @Column({
    type: 'enum',
    enum: ConfigDataType,
    default: ConfigDataType.STRING,
  })
  type!: ConfigDataType;

  @Column({
    type: 'enum',
    enum: ConfigCategory,
    default: ConfigCategory.CORE,
  })
  category!: ConfigCategory;

  @Column({ type: 'varchar', length: 255 })
  name!: string; // Friendly name for UI, e.g., "Tỉ giá quy đổi TRX/USDT"

  @Column({ type: 'text', nullable: true })
  description?: string; // Detailed logic description

  @Column({ type: 'boolean', default: false })
  isReadOnly!: boolean; // If true, UI won't allow edit, only view

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
