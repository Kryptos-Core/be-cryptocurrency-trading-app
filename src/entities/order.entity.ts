import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ForeignKey,
  Index,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { MarketPair } from './market-pair.entity';

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

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  price!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  filled_amount!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  avg_price!: string;

  @Column({
    type: 'enum',
    enum: ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'],
    default: 'OPEN',
  })
  status!: 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED';

  @Column({
    type: 'enum',
    enum: ['GTC', 'IOC', 'FOK'],
    default: 'GTC',
  })
  time_in_force!: 'GTC' | 'IOC' | 'FOK';

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  reserved_quote!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  reserved_base!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  client_order_id!: string;

  @Column({ type: 'varchar', length: 64 })
  idempotency_key!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(() => User, (user) => user.orders, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => MarketPair, (pair) => pair.orders, {
    onDelete: 'RESTRICT',
  })
  pair!: MarketPair;

  @OneToMany('Trade', 'taker_order')
  taker_trades!: any[];

  @OneToMany('Trade', 'maker_order')
  maker_trades!: any[];
}
