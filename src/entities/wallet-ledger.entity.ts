import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  ForeignKey,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Currency } from './currency.entity';
import { Wallet } from './wallet.entity';

@Entity('wallet_ledger')
@Index('uk_ledger_ref', [
  'ref_type',
  'ref_id',
  'user_id',
  'currency_id',
  'direction',
], { unique: true })
@Index('idx_ledger_user_time', ['user_id', 'created_at'])
@Index('idx_ledger_ref', ['ref_type', 'ref_id'])
export class WalletLedger {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  ledger_id!: number;

  @Column({ type: 'bigint' })
  @ForeignKey(() => User)
  user_id!: number;

  @Column({ type: 'int' })
  @ForeignKey(() => Currency)
  currency_id!: number;

  @Column({
    type: 'enum',
    enum: ['DEPOSIT', 'WITHDRAW', 'ORDER', 'TRADE', 'ADJUST', 'TRANSFER'],
  })
  ref_type!: 'DEPOSIT' | 'WITHDRAW' | 'ORDER' | 'TRADE' | 'ADJUST' | 'TRANSFER';

  @Column({ type: 'bigint' })
  ref_id!: number;

  @Column({ type: 'enum', enum: ['CREDIT', 'DEBIT'] })
  direction!: 'CREDIT' | 'DEBIT';

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  balance_after!: string;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => User, (user) => user.wallet_ledgers, {
    onDelete: 'CASCADE',
  })
  user!: User;

  @ManyToOne('Currency')
  @ForeignKey(() => Currency)
  currency!: any;

  @ManyToOne('Wallet')
  @ForeignKey(() => Wallet)
  wallet!: any;
}
