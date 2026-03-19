import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

type TreasuryMainWalletChain =
  | 'ETH_SEPOLIA'
  | 'ETH_MAINNET'
  | 'TRON_NILE'
  | 'TRON_SHASTA'
  | 'TRON_MAINNET';

@Entity('treasury_main_wallets')
@Index('idx_tmw_chain', ['chain'])
@Index('idx_tmw_chain_default', ['chain', 'is_default'])
export class TreasuryMainWallet {
  @PrimaryColumn({ type: 'char', length: 36 })
  main_wallet_id!: string;

  @Column({
    type: 'enum',
    enum: ['ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET'],
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

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
