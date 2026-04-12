import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { DECIMAL_36_18_COLUMN } from '@/common/constants/column-types';

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

  @Column({ ...DECIMAL_36_18_COLUMN })
  price!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  amount!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  taker_fee!: string;

  @Column({ ...DECIMAL_36_18_COLUMN })
  maker_fee!: string;

  @Column({ type: 'char', length: 36 })
  fee_currency_id!: string;

  @CreateDateColumn({ name: 'logged_at' })
  logged_at!: Date;
}
