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

export type UserBankAccountStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVOKED';

@Entity('user_bank_accounts')
@Index('idx_ubank_user_status', ['user_id', 'status'])
export class UserBankAccount {
  @PrimaryColumn({ type: 'char', length: 36 })
  bank_account_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({ type: 'varchar', length: 32 })
  bank_code!: string;

  @Column({ type: 'varchar', length: 128 })
  bank_name!: string;

  @Column({ type: 'text' })
  account_number_encrypted!: string;

  @Column({ type: 'char', length: 4 })
  account_number_last4!: string;

  @Column({ type: 'varchar', length: 200 })
  account_holder_name!: string;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'VERIFIED', 'REJECTED', 'REVOKED'],
    default: 'PENDING',
  })
  status!: UserBankAccountStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  verified_at!: Date | null;

  @Column({ type: 'char', length: 36, nullable: true })
  verified_by_user_id!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  rejection_reason!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
