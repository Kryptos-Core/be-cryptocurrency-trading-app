import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * CQRS read model for market pair list / lookups (maintained by projection).
 */
@Entity('read_market_pairs')
@Index('idx_read_market_pairs_symbol', ['symbol'], { unique: true })
export class ReadMarketPair {
  @PrimaryColumn({ type: 'char', length: 36 })
  pair_id!: string;

  @Column({ type: 'varchar', length: 32 })
  symbol!: string;

  @Column({ type: 'char', length: 36 })
  base_currency_id!: string;

  @Column({ type: 'char', length: 36 })
  quote_currency_id!: string;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updated_at!: Date;
}
