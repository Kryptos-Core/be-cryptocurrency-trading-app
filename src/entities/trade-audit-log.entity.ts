import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Immutable audit record for every fill executed by the matching engine.
 * Append-only: no updates, no deletes — compliance requirement.
 */
@Entity('trade_audit_log')
@Index('idx_audit_pair_time', ['pair_id', 'logged_at'])
@Index('idx_audit_trade', ['trade_id'])
export class TradeAuditLog {
  @PrimaryColumn({ type: 'char', length: 36 })
  trade_id!: string;

  @Column({ type: 'char', length: 36 })
  pair_id!: string;

  @Column({ type: 'char', length: 36 })
  maker_order_id!: string;

  @Column({ type: 'char', length: 36 })
  taker_order_id!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  price!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  taker_fee!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  maker_fee!: string;

  @Column({ type: 'char', length: 36 })
  fee_currency_id!: string;

  @CreateDateColumn({ name: 'logged_at' })
  logged_at!: Date;
}
