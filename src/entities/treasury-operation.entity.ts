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
import { DECIMAL_36_18_DEFAULT_ZERO_STRING_COLUMN } from '@/common/constants/column-types';
import { TransactionWallet } from './transaction-wallet.entity';
import { User } from './user.entity';

@Entity('treasury_operations')
@Index('idx_treasury_op_chain_type_status', ['chain', 'type', 'status'])
@Index('idx_treasury_op_created', ['created_at'])
export class TreasuryOperation {
  @PrimaryColumn({ type: 'char', length: 36 })
  operation_id!: string;

  @Column({
    type: 'enum',
    enum: ['SWEEP', 'FUND'],
  })
  type!: 'SWEEP' | 'FUND';

  @Column({
    type: 'enum',
    enum: [...BLOCKCHAIN_CHAIN_DB_VALUES],
  })
  chain!: BlockchainChainDbValue;

  @Column({ type: 'char', length: 36, nullable: true })
  @ForeignKey(() => TransactionWallet)
  from_wallet_id!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  @ForeignKey(() => TransactionWallet)
  to_wallet_id!: string | null;

  @Column({ ...DECIMAL_36_18_DEFAULT_ZERO_STRING_COLUMN })
  amount!: string;

  /** NATIVE = chain native coin (TRX, ETH, SOL); USDT_TRC20 = TRC-20 USDT (Tron networks only). */
  @Column({ type: 'varchar', length: 24, default: 'NATIVE' })
  asset!: 'NATIVE' | 'USDT_TRC20';

  @Column({ type: 'varchar', length: 255, nullable: true })
  tx_hash!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  onchain_tx_id!: string | null;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'PROCESSING', 'TX_BROADCAST', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
  })
  status!: 'PENDING' | 'PROCESSING' | 'TX_BROADCAST' | 'COMPLETED' | 'FAILED';

  /** Set BEFORE the RPC broadcast call. On retry: if set but tx_hash is NULL → broadcast was attempted. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  broadcast_idempotency_key!: string | null;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  actor_user_id!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  failure_reason!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at!: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_user_id' })
  actor_user!: User;

  @ManyToOne(() => TransactionWallet, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'from_wallet_id' })
  from_wallet!: TransactionWallet | null;

  @ManyToOne(() => TransactionWallet, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'to_wallet_id' })
  to_wallet!: TransactionWallet | null;
}
