import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  ForeignKey,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { TransactionWallet } from './transaction-wallet.entity';

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
    enum: ['ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET'],
  })
  chain!:
    | 'ETH_SEPOLIA'
    | 'ETH_MAINNET'
    | 'TRON_NILE'
    | 'TRON_SHASTA'
    | 'TRON_MAINNET';

  @Column({ type: 'char', length: 36, nullable: true })
  @ForeignKey(() => TransactionWallet)
  from_wallet_id!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  @ForeignKey(() => TransactionWallet)
  to_wallet_id!: string | null;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: '0' })
  amount!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tx_hash!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  onchain_tx_id!: string | null;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
  })
  status!: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  actor_user_id!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  failure_reason!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @Column({ type: 'datetime', nullable: true })
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
