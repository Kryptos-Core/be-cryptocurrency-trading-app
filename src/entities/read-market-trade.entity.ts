import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { DECIMAL_36_18_COLUMN, DECIMAL_36_18_DEFAULT_0_COLUMN } from '@/common/constants/column-types';

@Entity('read_market_trades')
@Index('idx_read_market_trades_pair_executed', ['pair_id', 'executed_at'])
export class ReadMarketTrade {
  @PrimaryColumn({ type: 'char', length: 36 })
  trade_id!: string;

  @Column({ type: 'char', length: 36 })
  pair_id!: string;

  @Column({ type: 'char', length: 36 })
  maker_order_id!: string;

  @Column({ type: 'char', length: 36 })
  taker_order_id!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  price!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  amount!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  maker_fee!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  taker_fee!: string;

  @Column({ type: 'char', length: 36 })
  fee_currency_id!: string;

  @Column({ type: 'timestamp', precision: 6 })
  executed_at!: Date;

  @Column({ type: 'char', length: 36, nullable: true })
  last_outbox_id!: string | null;
}
