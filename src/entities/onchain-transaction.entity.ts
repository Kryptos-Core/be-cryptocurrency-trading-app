import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  ForeignKey,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { LinkedWallet } from './linked-wallet.entity';
import { BLOCKCHAIN_CHAIN_DB_VALUES } from '@/common/constants/blockchain-chain-db';

@Entity('onchain_transactions')
@Index('uk_onchain_tx_hash', ['chain', 'tx_hash'], { unique: true })
@Index('idx_onchain_tx_user', ['user_id', 'type', 'status'])
@Index('idx_onchain_tx_created', ['user_id', 'created_at'])
@Index('idx_onchain_tx_treasury_operation', ['treasury_operation_id'])
export class OnchainTransaction {
  @PrimaryColumn({ type: 'char', length: 36 })
  tx_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

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

  @Column({ type: 'varchar', length: 255, nullable: true })
  tx_hash!: string | null;

  @Column({ type: 'varchar', length: 255 })
  from_address!: string;

  @Column({ type: 'varchar', length: 255 })
  to_address!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({ type: 'int', default: 0 })
  confirmations!: number;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
  })
  status!: 'PENDING' | 'CONFIRMING' | 'COMPLETED' | 'FAILED';

  @CreateDateColumn()
  created_at!: Date;

  @Column({ type: 'datetime', nullable: true })
  confirmed_at!: Date | null;

  /** ID của currency được credit vào ví sau quy đổi (thường là USDT) */
  @Column({ type: 'char', length: 36, nullable: true })
  credited_currency_id!: string | null;

  /** Số lượng cash currency (USDT) thực tế được credit sau khi quy đổi */
  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  credited_amount!: string | null;

  /** Tỷ giá quy đổi: 1 native coin = X USDT tại thời điểm giao dịch */
  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  conversion_rate!: string | null;

  @ManyToOne(() => User, (user) => user.onchain_transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => LinkedWallet, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'linked_wallet_id' })
  linked_wallet!: LinkedWallet | null;
}
