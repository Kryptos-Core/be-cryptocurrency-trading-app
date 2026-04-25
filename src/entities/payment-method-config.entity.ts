import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type PaymentMethodType = 'PAYOS' | 'ETH' | 'TRON' | 'SOL' | 'BSC';
export type PaymentMethodStatus = 'ACTIVE' | 'TRANSITIONING' | 'INACTIVE';

/**
 * PaymentMethodConfig Entity
 * Stores dynamic payment gateway configurations encrypted with AES-256-GCM.
 * Replaces hard-coded .env values for PayOS credentials and blockchain hot wallet keys.
 *
 * encrypted_config JSON shapes:
 *  PAYOS:       { clientId, apiKey, checksumKey, returnUrl, cancelUrl,
 *                 fiatSymbol, quoteCurrencySymbol, fiatToQuoteRate, fxSpreadBps }
 *  ETH/TRON/SOL: { rpcUrl, hotWalletPrivateKey, chainId?,
 *                   withdrawAutoMax, nativeCurrencySymbol, isMainnet, fxFallbackRate }
 */
@Entity('payment_method_configs')
@Index('idx_pmc_type_network_status', ['type', 'network', 'status'])
@Index('idx_pmc_status', ['status'])
export class PaymentMethodConfig {
  @PrimaryColumn({ type: 'char', length: 36 })
  config_id!: string;

  @Column({ type: 'enum', enum: ['PAYOS', 'ETH', 'TRON', 'SOL', 'BSC'] })
  type!: PaymentMethodType;

  /** Network identifier: MAINNET, TESTNET, NILE, SHASTA, DEVNET, CHAPEL, etc. */
  @Column({ type: 'varchar', length: 64 })
  network!: string;

  @Column({ type: 'varchar', length: 128 })
  display_name!: string;

  /** AES-256-GCM encrypted JSON — uses same WALLET_ENCRYPTION_KEY as managed_wallets */
  @Column({ type: 'text' })
  encrypted_config!: string;

  /** Incremented on every update to bust in-memory caches in dependent services */
  @Column({ type: 'int', unsigned: true, default: 1 })
  config_version!: number;

  @Column({
    type: 'enum',
    enum: ['ACTIVE', 'TRANSITIONING', 'INACTIVE'],
    default: 'INACTIVE',
  })
  status!: PaymentMethodStatus;

  /** Minutes to wait before switching from TRANSITIONING → ACTIVE */
  @Column({ type: 'int', unsigned: true, default: 15 })
  grace_period_minutes!: number;

  /** Set when status transitions to TRANSITIONING */
  @Column({ type: 'timestamp', nullable: true })
  transition_started_at!: Date | null;

  /** Set when status transitions to ACTIVE */
  @Column({ type: 'timestamp', nullable: true })
  activated_at!: Date | null;

  /** Lower number = higher priority when multiple active configs of same type */
  @Column({ type: 'int', default: 0 })
  sort_order!: number;

  @Column({ type: 'char', length: 36 })
  created_by!: string;

  @Column({ type: 'char', length: 36 })
  updated_by!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
