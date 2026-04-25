import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Per-chain cursor for automatic on-chain deposit polling (TronGrid / RPC). */
@Entity('deposit_watcher_cursors')
export class DepositWatcherCursor {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  chain!: string;

  /** Last processed `block_timestamp` (ms) for TronGrid TRC-20 list, or last block number for EVM. */
  @Column({ type: 'bigint', default: 0 })
  cursor_value!: string;

  @Column({ type: 'varchar', length: 32, default: 'TIMESTAMP_MS' })
  cursor_kind!: 'TIMESTAMP_MS' | 'BLOCK_NUMBER';

  @UpdateDateColumn({ type: 'timestamp', precision: 6 })
  updated_at!: Date;
}
