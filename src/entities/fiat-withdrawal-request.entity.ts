import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  ForeignKey,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { UserBankAccount } from './user-bank-account.entity';
import { Currency } from './currency.entity';

export type FiatWithdrawalRequestStatus = 'PENDING_REVIEW' | 'COMPLETED' | 'REJECTED';

@Entity('fiat_withdrawal_requests')
@Index('idx_fiat_wd_user', ['user_id', 'created_at'])
@Index('idx_fiat_wd_status', ['status', 'created_at'])
export class FiatWithdrawalRequest {
  @PrimaryColumn({ type: 'char', length: 36 })
  request_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => UserBankAccount)
  bank_account_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Currency)
  currency_id!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  fee!: string;

  @Column({
    type: 'enum',
    enum: ['PENDING_REVIEW', 'COMPLETED', 'REJECTED'],
    default: 'PENDING_REVIEW',
  })
  status!: FiatWithdrawalRequestStatus;

  @Column({ type: 'varchar', length: 64 })
  idempotency_key!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  admin_note!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  transfer_reference!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  processed_by_user_id!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  processed_at!: Date | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  rejection_reason!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => UserBankAccount)
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount!: UserBankAccount;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency_id' })
  currency!: Currency;
}
