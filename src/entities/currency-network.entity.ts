import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ForeignKey,
  Index,
  OneToMany,
} from 'typeorm';
import { Currency } from './currency.entity';

@Entity('currency_networks')
@Index('uk_currency_network', ['currency_id', 'network_code'], {
  unique: true,
})
export class CurrencyNetwork {
  @PrimaryGeneratedColumn()
  network_id!: number;

  @Column({ type: 'int' })
  @ForeignKey(() => Currency)
  currency_id!: number;

  @Column({ type: 'varchar', length: 32 })
  network_code!: string;

  @Column({ type: 'boolean', default: true })
  deposit_enabled!: boolean;

  @Column({ type: 'boolean', default: true })
  withdraw_enabled!: boolean;

  @Column({ type: 'int', default: 12 })
  min_confirmations!: number;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  withdraw_fee!: string;

  @ManyToOne(() => Currency, (currency) => currency.networks, {
    onDelete: 'CASCADE',
  })
  currency!: Currency;

  @OneToMany('Deposit', 'network')
  deposits!: any[];

  @OneToMany('Withdrawal', 'network')
  withdrawals!: any[];
}
