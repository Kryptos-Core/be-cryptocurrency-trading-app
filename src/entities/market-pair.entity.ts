import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { Currency } from './currency.entity';

@Entity('market_pairs')
@Index('uk_pair_symbol', ['symbol'], { unique: true })
@Index('uk_pair_base_quote', ['base_currency_id', 'quote_currency_id'], {
  unique: true,
})
@Index('idx_pair_active', ['is_active'])
export class MarketPair {
  @PrimaryColumn({ type: 'char', length: 36 })
  pair_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Currency)
  base_currency_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Currency)
  quote_currency_id!: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  symbol!: string;

  @Column({ type: 'tinyint', default: 2 })
  price_scale!: number;

  @Column({ type: 'tinyint', default: 6 })
  amount_scale!: number;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0.0001 })
  min_order_amount!: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, default: 0.001 })
  maker_fee_rate!: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, default: 0.001 })
  taker_fee_rate!: string;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(
    () => Currency,
    (currency) => currency.base_pairs,
    {
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'base_currency_id' })
  base_currency!: Currency;

  @ManyToOne(
    () => Currency,
    (currency) => currency.quote_pairs,
    {
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'quote_currency_id' })
  quote_currency!: Currency;

  @OneToMany('Order', 'pair')
  orders!: any[];

  @OneToMany('Trade', 'pair')
  trades!: any[];

  @OneToMany('PriceAlert', 'pair')
  price_alerts!: any[];
}
