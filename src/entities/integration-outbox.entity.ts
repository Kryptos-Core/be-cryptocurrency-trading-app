import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('integration_outbox')
@Index('idx_integration_outbox_unpublished', ['published_at', 'occurred_at'])
export class IntegrationOutbox {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  aggregate_type!: string;

  @Column({ type: 'varchar', length: 64 })
  aggregate_id!: string;

  @Column({ type: 'varchar', length: 128 })
  event_type!: string;

  @Column({ type: 'json' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ type: 'datetime', precision: 6, name: 'occurred_at' })
  occurred_at!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  published_at!: Date | null;

  @Column({ type: 'varchar', length: 191, nullable: true, unique: true })
  dedupe_key!: string | null;
}
