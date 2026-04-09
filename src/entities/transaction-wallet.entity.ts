import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BLOCKCHAIN_CHAIN_DB_VALUES, BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';

@Entity('transaction_wallets')
@Index('uk_tx_wallet_chain_address', ['chain', 'address'], { unique: true })
@Index('idx_tx_wallet_chain_purpose', ['chain', 'purpose'])
@Index('idx_tx_wallet_chain_active', ['chain', 'is_active'])
export class TransactionWallet {
  @PrimaryColumn({ type: 'char', length: 36 })
  wallet_id!: string;

  @Column({
    type: 'enum',
    enum: [...BLOCKCHAIN_CHAIN_DB_VALUES],
  })
  chain!: BlockchainChainDbValue;

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

  /** User-facing deposit address default for this chain (at most one active per chain). */
  @Column({ type: 'boolean', default: false })
  is_default_user_deposit!: boolean;

  @Column({ type: 'datetime', nullable: true, precision: 6 })
  default_set_at!: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
