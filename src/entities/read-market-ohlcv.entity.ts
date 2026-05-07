import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  DECIMAL_36_18_COLUMN,
  DECIMAL_36_18_DEFAULT_0_COLUMN,
} from '@/common/constants/column-types';

@Entity('read_market_ohlcv')
@Index('idx_read_market_ohlcv_pair_interval_time', ['pair_id', 'interval_sec', 'open_time'])
export class ReadMarketOhlcv {
  @PrimaryColumn({ type: 'char', length: 36 })
  pair_id!: string;

  @PrimaryColumn({ type: 'int' })
  interval_sec!: number;

  @PrimaryColumn({ type: 'timestamp', precision: 6 })
  open_time!: Date;

  @Column({ ...DECIMAL_36_18_COLUMN })
  open!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  high!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  low!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  close!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  volume!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  quote_volume!: string;

  @Column({ type: 'int', default: 0 })
  trades_count!: number;

  @Column({ type: 'char', length: 36, nullable: true })
  last_trade_id!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  last_outbox_id!: string | null;
}
