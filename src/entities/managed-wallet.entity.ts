import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  BLOCKCHAIN_CHAIN_DB_VALUES,
  type BlockchainChainDbValue,
} from '@/common/constants/blockchain-chain-db';
import { User } from './user.entity';

@Entity('managed_wallets')
@Index('uk_managed_wallet_user_chain_addr', ['user_id', 'chain', 'address'], {
  unique: true,
})
@Index('idx_managed_wallet_chain_default', ['chain', 'is_default_deposit'])
@Index('idx_managed_wallet_user_active', ['user_id', 'is_active'])
export class ManagedWallet {
  @PrimaryColumn({ type: 'char', length: 36 })
  wallet_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({
    type: 'enum',
    enum: [...BLOCKCHAIN_CHAIN_DB_VALUES],
  })
  chain!: BlockchainChainDbValue;

  @Column({ type: 'varchar', length: 255 })
  address!: string;

  @Column({ type: 'varchar', length: 255 })
  public_key!: string;

  @Column({ type: 'text' })
  encrypted_private_key!: string;

  @Column({ type: 'text', nullable: true })
  encrypted_seed_phrase!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label!: string | null;

  @Column({ type: 'boolean', default: false })
  is_default_deposit!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  default_set_at!: Date | null;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(
    () => User,
    (user) => user.managed_wallets,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
