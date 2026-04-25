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
  UpdateDateColumn,
} from 'typeorm';
import {
  DECIMAL_36_18_COLUMN,
  DECIMAL_36_18_DEFAULT_0_COLUMN,
  DECIMAL_36_18_NULLABLE_COLUMN,
} from '@/common/constants/column-types';
import { MarketPair } from './market-pair.entity';
import { User } from './user.entity';

@Entity('orders')
@Index('uk_order_idem', ['user_id', 'idempotency_key'], { unique: true })
@Index('idx_orders_user', ['user_id', 'created_at'])
@Index('idx_orders_pair_status', ['pair_id', 'status', 'created_at'])
@Index('idx_orders_book', ['pair_id', 'side', 'status', 'price', 'created_at'])
export class Order {
  @PrimaryColumn({ type: 'char', length: 36 })
  order_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => User)
  user_id!: string;

  @Column({ type: 'char', length: 36 })
  @ForeignKey(() => MarketPair)
  pair_id!: string;

  @Column({ type: 'enum', enum: ['BUY', 'SELL'] })
  side!: 'BUY' | 'SELL';

  @Column({ type: 'enum', enum: ['LIMIT', 'MARKET'] })
  type!: 'LIMIT' | 'MARKET';

  @Column({ ...DECIMAL_36_18_NULLABLE_COLUMN })
  price!: string | null;

  @Column({ ...DECIMAL_36_18_COLUMN })
  amount!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  filled_amount!: string;

  @Column({ ...DECIMAL_36_18_NULLABLE_COLUMN })
  avg_price!: string | null;

  @Column({
    type: 'enum',
    enum: ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'],
    default: 'OPEN',
  })
  status!: 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED';

  @Column({ type: 'enum', enum: ['GTC', 'IOC', 'FOK'], default: 'GTC' })
  time_in_force!: 'GTC' | 'IOC' | 'FOK';

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  reserved_quote!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  reserved_base!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  client_order_id!: string | null;

  @Column({ type: 'varchar', length: 64 })
  idempotency_key!: string;

  @Column({ ...DECIMAL_36_18_NULLABLE_COLUMN })
  slippage_tolerance!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(() => User, (user) => user.orders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => MarketPair, (pair) => pair.orders, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pair_id' })
  pair!: MarketPair;

  @OneToMany('Trade', 'taker_order')
  taker_trades!: unknown[];

  @OneToMany('Trade', 'maker_order')
  maker_trades!: unknown[];
}
