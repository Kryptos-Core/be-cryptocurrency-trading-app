import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import {
  DECIMAL_36_18_COLUMN,
  DECIMAL_36_18_DEFAULT_0_COLUMN,
} from '@/common/constants/column-types';
import { Currency } from './currency.entity';
import { MarketPair } from './market-pair.entity';
import { Order } from './order.entity';

@Entity('trades')
@Index('idx_trades_pair_time', ['pair_id', 'created_at'])
@Index('idx_trades_taker', ['taker_order_id'])
@Index('idx_trades_maker', ['maker_order_id'])
export class Trade {
  @PrimaryColumn({ type: 'char', length: 36 })
  trade_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => MarketPair)
  pair_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Order)
  taker_order_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Order)
  maker_order_id!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  price!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  amount!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  taker_fee!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  maker_fee!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => Currency)
  fee_currency_id!: string;

  @CreateDateColumn()
  created_at!: Date;

  @ManyToOne(
    () => MarketPair,
    (pair) => pair.trades,
    {
      onDelete: 'RESTRICT',
    },
  )
  pair!: MarketPair;

  @ManyToOne(
    () => Order,
    (order) => order.taker_trades,
    {
      onDelete: 'CASCADE',
    },
  )
  taker_order!: Order;

  @ManyToOne(
    () => Order,
    (order) => order.maker_trades,
    {
      onDelete: 'CASCADE',
    },
  )
  maker_order!: Order;

  @ManyToOne('Currency')
  @ForeignKey(() => Currency)
  fee_currency!: any;
}
