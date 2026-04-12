import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Currency } from './currency.entity';
import { CurrencyNetwork } from './currency-network.entity';
import { User } from './user.entity';

@Entity('withdrawals')
@Index('uk_withdraw_idem', ['user_id', 'idempotency_key'], { unique: true })
@Index('idx_withdraw_user', ['user_id', 'status'])
export class Withdrawal {
  @PrimaryColumn({ type: 'char', length: 36 })
  withdraw_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Currency)
  currency_id!: string;

  @Column({ type: 'char', length: 36, nullable: true })
  @ForeignKey(() => CurrencyNetwork)
  network_id!: string | null;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  fee!: string;

  @Column({ type: 'varchar', length: 255 })
  to_address!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tx_hash!: string;

  @Column({
    type: 'enum',
    enum: ['REQUESTED', 'APPROVED', 'SENT', 'COMPLETED', 'REJECTED', 'FAILED'],
    default: 'REQUESTED',
  })
  status!: 'REQUESTED' | 'APPROVED' | 'SENT' | 'COMPLETED' | 'REJECTED' | 'FAILED';

  @Column({ type: 'varchar', length: 64 })
  idempotency_key!: string;

  @CreateDateColumn()
  requested_at!: Date;

  @Column({ type: 'datetime', nullable: true })
  processed_at!: Date;

  @ManyToOne(
    () => User,
    (user) => user.withdrawals,
    { onDelete: 'CASCADE' },
  )
  user!: User;

  @ManyToOne(
    () => Currency,
    (currency) => currency.withdrawals,
    {
      onDelete: 'RESTRICT',
    },
  )
  currency!: Currency;

  @ManyToOne(
    () => CurrencyNetwork,
    (network) => network.withdrawals,
    {
      onDelete: 'SET NULL',
      nullable: true,
    },
  )
  network!: CurrencyNetwork;
}
