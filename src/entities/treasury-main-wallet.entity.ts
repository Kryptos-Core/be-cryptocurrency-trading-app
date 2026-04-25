import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import {
  BLOCKCHAIN_CHAIN_DB_VALUES,
  type BlockchainChainDbValue,
} from '@/common/constants/blockchain-chain-db';

export type TreasuryMainWalletChain = BlockchainChainDbValue;

export type TreasuryMainWalletStatus =
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'PENDING_DELETION';

@Entity('treasury_main_wallets')
@Index('idx_tmw_chain', ['chain'])
@Index('idx_tmw_chain_default', ['chain', 'is_default'])
@Index('idx_tmw_status', ['status'])
@Index('uk_tmw_chain_address', ['chain', 'address'], { unique: true })
export class TreasuryMainWallet {
  @PrimaryColumn({ type: 'char', length: 36 })
  main_wallet_id!: string;

  @Column({
    type: 'enum',
    enum: [...BLOCKCHAIN_CHAIN_DB_VALUES],
  })
  chain!: TreasuryMainWalletChain;

  @Column({ type: 'varchar', length: 255 })
  address!: string;

  @Column({ type: 'text' })
  encrypted_private_key!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label!: string | null;

  @Column({ type: 'boolean', default: false })
  is_default!: boolean;

  /** Approval workflow state */
  @Column({
    type: 'enum',
    enum: ['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'PENDING_DELETION'],
    default: 'ACTIVE',
  })
  status!: TreasuryMainWalletStatus;

  // ── Audit trail ────────────────────────────────────────────────────────
  @Column({ type: 'char', length: 36, nullable: true })
  created_by!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  approved_by!: string | null;

  @Column({ type: 'timestamp', nullable: true, precision: 6 })
  approved_at!: Date | null;

  @Column({ type: 'char', length: 36, nullable: true })
  rejected_by!: string | null;

  @Column({ type: 'timestamp', nullable: true, precision: 6 })
  rejected_at!: Date | null;

  // ── Auto-rotation tracking ─────────────────────────────────────────────
  @Column({ type: 'timestamp', nullable: true, precision: 6 })
  last_rotated_at!: Date | null;

  /** Per-wallet override interval in days. NULL = follow global rotation policy. */
  @Column({ type: 'int', unsigned: true, nullable: true, default: null })
  rotation_interval_days!: number | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
