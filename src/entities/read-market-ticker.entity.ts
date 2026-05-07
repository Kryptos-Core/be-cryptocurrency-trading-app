import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  DECIMAL_36_18_COLUMN,
  DECIMAL_36_18_DEFAULT_0_COLUMN,
} from '@/common/constants/column-types';

@Entity('read_market_tickers')
@Index('idx_read_market_tickers_symbol', ['symbol'])
export class ReadMarketTicker {
  @PrimaryColumn({ type: 'char', length: 36 })
  pair_id!: string;

  @Column({ type: 'varchar', length: 32 })
  symbol!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  last_price!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  best_bid!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  best_ask!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  volume_24h!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  volume_24h_usd!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  change_24h!: string;

  @Column({ ...DECIMAL_36_18_DEFAULT_0_COLUMN })
  change_percent_24h!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  high_24h!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  low_24h!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  open_24h!: string;

  @Column({ type: 'timestamp', precision: 6 })
  ticker_timestamp!: Date;

  @Column({ type: 'char', length: 36, nullable: true })
  last_outbox_id!: string | null;
}
