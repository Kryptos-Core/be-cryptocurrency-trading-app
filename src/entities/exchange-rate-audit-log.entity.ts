import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('exchange_rate_audit_log')
@Index('idx_exchange_rate_audit_changed_by', ['changed_by'])
@Index('idx_exchange_rate_audit_created_at', ['created_at'])
export class ExchangeRateAuditLog {
  @PrimaryColumn({ type: 'char', length: 36 })
  audit_id!: string;

  @Column({ type: 'char', length: 36 })
  changed_by!: string;

  @Column({ type: 'varchar', length: 32 })
  action!: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  previous_rate!: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  new_rate!: string;

  @Column({ type: 'int', unsigned: true })
  previous_spread_bps!: string;

  @Column({ type: 'int', unsigned: true })
  new_spread_bps!: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  market_rate!: string;

  @Column({ type: 'varchar', length: 32 })
  source!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
