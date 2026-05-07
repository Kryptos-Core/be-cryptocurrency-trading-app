import { Column, Entity, ForeignKey, Index, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { DECIMAL_36_18_DEFAULT_0_COLUMN } from '@/common/constants/column-types';
import { Currency } from './currency.entity';

@Entity('currency_networks')
@Index('uk_currency_network', ['currency_id', 'network_code'], {
  unique: true,
})
export class CurrencyNetwork {
  @PrimaryColumn({ type: 'char', length: 36 })
  network_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Currency)
  currency_id!: string;

  @Column({ type: 'varchar', length: 32 })
  network_code!: string;

  @Column({ type: 'boolean', default: true })
  deposit_enabled!: boolean;

  @Column({ type: 'boolean', default: true })
  withdraw_enabled!: boolean;

  @Column({ type: 'int', default: 12 })
  min_confirmations!: number;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  withdraw_fee!: string;

  @ManyToOne(
    () => Currency,
    (currency) => currency.networks,
    { onDelete: 'CASCADE' },
  )
  currency!: Currency;

  @OneToMany('Deposit', 'network')
  deposits!: unknown[];

  @OneToMany('Withdrawal', 'network')
  withdrawals!: unknown[];
}
