import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { BLOCKCHAIN_CHAIN_DB_VALUES } from '@/common/constants/blockchain-chain-db';
import {
  DECIMAL_36_18_COLUMN,
  DECIMAL_36_18_NULLABLE_COLUMN,
} from '@/common/constants/column-types';
import { User } from '@/entities/user.entity';
import { LinkedWallet } from './linked-wallet.entity';

@Entity('onchain_transactions')
@Index('uk_onchain_tx_chain_hash_log', ['chain', 'tx_hash', 'log_index'], { unique: true })
@Index('idx_onchain_tx_user', ['user_id', 'type', 'status'])
@Index('idx_onchain_tx_created', ['user_id', 'created_at'])
@Index('idx_onchain_tx_treasury_operation', ['treasury_operation_id'])
export class OnchainTransaction {
  @PrimaryColumn({ type: 'char', length: 36 })
  tx_id!: string;

  @Column({ type: 'char', length: 36, nullable: true })
  @ForeignKey(() => User)
  user_id!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  @ForeignKey(() => LinkedWallet)
  linked_wallet_id!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  treasury_operation_id!: string | null;

  @Column({
    type: 'enum',
    enum: [...BLOCKCHAIN_CHAIN_DB_VALUES],
  })
  chain!: string;

  @Column({
    type: 'enum',
    enum: ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'SWEEP', 'FUND'],
  })
  type!: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'SWEEP' | 'FUND';

  /** Asset type: NATIVE (TRX/ETH/SOL) hoặc USDT_TRC20 (Tron networks). Default: NATIVE */
  @Column({
    type: 'enum',
    enum: ['NATIVE', 'USDT_TRC20'],
    default: 'NATIVE',
  })
  asset!: 'NATIVE' | 'USDT_TRC20';

  @Column({ type: 'varchar', length: 255, nullable: true })
  tx_hash!: string | null;

  /** EVM log index when one tx has multiple token transfers; Tron uses 0 / per-leg index. */
  @Column({ type: 'int', default: 0 })
  log_index!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  from_address!: string | null;

  @Column({ type: 'varchar', length: 255 })
  to_address!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  amount!: string;

  @Column({ type: 'int', default: 0 })
  confirmations!: number;

  @Column({
    type: 'enum',
    enum: ['UNMATCHED', 'PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
  })
  status!: 'UNMATCHED' | 'PENDING' | 'CONFIRMING' | 'COMPLETED' | 'FAILED';

  @CreateDateColumn()
  created_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  confirmed_at!: Date | null;

  /** ID của currency được credit vào ví sau quy đổi (thường là USDT) */
  @Column({ type: 'char', length: 36, nullable: true })
  credited_currency_id!: string | null;

  /** Số lượng cash currency (USDT) thực tế được credit sau khi quy đổi */
  @Column({ ...DECIMAL_36_18_NULLABLE_COLUMN })
  credited_amount!: string | null;

  /** Tỷ giá quy đổi: 1 native coin = X USDT tại thời điểm giao dịch */
  @Column({ ...DECIMAL_36_18_NULLABLE_COLUMN })
  conversion_rate!: string | null;

  @ManyToOne(
    () => User,
    (user) => user.onchain_transactions,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => LinkedWallet, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'linked_wallet_id' })
  linked_wallet!: LinkedWallet | null;
}
