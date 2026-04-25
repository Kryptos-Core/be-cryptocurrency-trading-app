import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { DECIMAL_36_18_COLUMN } from '@/common/constants/column-types';
import { Currency } from './currency.entity';
import { User } from './user.entity';
import { Wallet } from './wallet.entity';

@Entity('wallet_ledger')
@Index('uk_ledger_ref', ['ref_type', 'ref_id', 'user_id', 'currency_id', 'direction'], { unique: true })
@Index('idx_ledger_user_time', ['user_id', 'created_at'])
@Index('idx_ledger_ref', ['ref_type', 'ref_id'])
export class WalletLedger {
  @PrimaryColumn({ type: 'char', length: 36 })
  ledger_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Currency)
  currency_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Wallet)
  wallet_id!: string;

  @Column({
    type: 'enum',
    enum: ['DEPOSIT', 'WITHDRAW', 'ORDER', 'TRADE', 'ADJUST', 'TRANSFER', 'EXTERNAL_DEPOSIT', 'EXTERNAL_WITHDRAWAL', 'EXTERNAL_SYNC'],
  })
  ref_type!:
    | 'DEPOSIT'
    | 'WITHDRAW'
    | 'ORDER'
    | 'TRADE'
    | 'ADJUST'
    | 'TRANSFER'
    | 'EXTERNAL_DEPOSIT'
    | 'EXTERNAL_WITHDRAWAL'
    | 'EXTERNAL_SYNC'
    | 'RECONCILIATION';

  @Column({ type: 'char', length: 36 })
  ref_id!: string;

  @Column({ type: 'enum', enum: ['CREDIT', 'DEBIT'] })
  direction!: 'CREDIT' | 'DEBIT';

  @Column({ ...DECIMAL_36_18_COLUMN })
  amount!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  balance_after!: string;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => User, (user) => user.wallet_ledgers, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne('Currency')
  @ForeignKey(() => Currency)
  currency!: Currency;

  @ManyToOne('Wallet')
  @ForeignKey(() => Wallet)
  wallet!: Wallet;
}
