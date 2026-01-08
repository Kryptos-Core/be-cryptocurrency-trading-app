import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  ForeignKey,
  Index,
} from 'typeorm';
import { MarketPair } from './market-pair.entity';
import { Order } from './order.entity';
import { Currency } from './currency.entity';

@Entity('trades')
@Index('idx_trades_pair_time', ['pair_id', 'created_at'])
@Index('idx_trades_taker', ['taker_order_id'])
@Index('idx_trades_maker', ['maker_order_id'])
export class Trade {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  trade_id!: number;

  @Column({ type: 'int' })
  @ForeignKey(() => MarketPair)
  pair_id!: number;

  @Column({ type: 'bigint' })
  @ForeignKey(() => Order)
  taker_order_id!: number;

  @Column({ type: 'bigint' })
  @ForeignKey(() => Order)
  maker_order_id!: number;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  price!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  taker_fee!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  maker_fee!: string;

  @Column({ type: 'int' })
  @ForeignKey(() => Currency)
  fee_currency_id!: number;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(() => MarketPair, (pair) => pair.trades, {
    onDelete: 'RESTRICT',
  })
  pair!: MarketPair;

  @ManyToOne(() => Order, (order) => order.taker_trades, {
    onDelete: 'CASCADE',
  })
  taker_order!: Order;

  @ManyToOne(() => Order, (order) => order.maker_trades, {
    onDelete: 'CASCADE',
  })
  maker_order!: Order;

  @ManyToOne('Currency')
  @ForeignKey(() => Currency)
  fee_currency!: any;
}
