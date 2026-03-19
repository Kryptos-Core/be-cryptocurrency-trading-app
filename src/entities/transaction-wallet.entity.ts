import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('transaction_wallets')
@Index('uk_tx_wallet_chain_address', ['chain', 'address'], { unique: true })
@Index('idx_tx_wallet_chain_purpose', ['chain', 'purpose'])
@Index('idx_tx_wallet_chain_active', ['chain', 'is_active'])
export class TransactionWallet {
  @PrimaryColumn({ type: 'char', length: 36 })
  wallet_id!: string;

  @Column({
    type: 'enum',
    enum: ['ETH_SEPOLIA', 'TRON_NILE', 'TRON_SHASTA'],
  })
  chain!: 'ETH_SEPOLIA' | 'TRON_NILE' | 'TRON_SHASTA';

  @Column({ type: 'varchar', length: 255 })
  address!: string;

  @Column({
    type: 'enum',
    enum: ['DEPOSIT', 'WITHDRAWAL', 'BOTH'],
    default: 'BOTH',
  })
  purpose!: 'DEPOSIT' | 'WITHDRAWAL' | 'BOTH';

  @Column({ type: 'text' })
  encrypted_private_key!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label!: string | null;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
