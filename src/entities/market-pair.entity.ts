import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  ForeignKey,
  Index,
  OneToMany,
} from 'typeorm';
import { Currency } from './currency.entity';

@Entity('market_pairs')
@Index('uk_pair_symbol', ['symbol'], { unique: true })
@Index('uk_pair_base_quote', ['base_currency_id', 'quote_currency_id'], {
  unique: true,
})
@Index('idx_pair_active', ['is_active'])
export class MarketPair {
  @PrimaryGeneratedColumn()
  pair_id!: number;

  @Column({ type: 'int' })
  @ForeignKey(() => Currency)
  base_currency_id!: number;

  @Column({ type: 'int' })
  @ForeignKey(() => Currency)
  quote_currency_id!: number;

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

  @ManyToOne(() => Currency, (currency) => currency.base_pairs, {
    onDelete: 'RESTRICT',
  })
  base_currency!: Currency;

  @ManyToOne(() => Currency, (currency) => currency.quote_pairs, {
    onDelete: 'RESTRICT',
  })
  quote_currency!: Currency;

  @OneToMany('Order', 'pair')
  orders!: any[];

  @OneToMany('Trade', 'pair')
  trades!: any[];

  @OneToMany('PriceAlert', 'pair')
  price_alerts!: any[];
}
