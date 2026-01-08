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
import { CurrencyNetwork } from './currency-network.entity';

@Entity('deposits')
@Index('uk_deposit_tx', ['currency_id', 'tx_hash'], { unique: true })
@Index('idx_deposit_user', ['user_id', 'status'])
export class Deposit {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  deposit_id!: number;

  @Column({ type: 'bigint' })
  @ForeignKey(() => User)
  user_id!: number;

  @Column({ type: 'int' })
  @ForeignKey(() => Currency)
  currency_id!: number;

  @Column({ type: 'int', nullable: true })
  @ForeignKey(() => CurrencyNetwork)
  network_id!: number;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({ type: 'varchar', length: 255 })
  tx_hash!: string;

  @Column({ type: 'int', default: 0 })
  confirmations!: number;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'CONFIRMED', 'CREDITED', 'FAILED'],
    default: 'PENDING',
  })
  status!: 'PENDING' | 'CONFIRMED' | 'CREDITED' | 'FAILED';

  @CreateDateColumn()
  detected_at!: Date;

  @Column({ type: 'datetime', nullable: true })
  credited_at!: Date;

  @ManyToOne(() => User, (user) => user.deposits, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => Currency, (currency) => currency.deposits, {
    onDelete: 'RESTRICT',
  })
  currency!: Currency;

  @ManyToOne(() => CurrencyNetwork, (network) => network.deposits, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  network!: CurrencyNetwork;
}
