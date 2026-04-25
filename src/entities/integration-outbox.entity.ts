import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('integration_outbox')
@Index('idx_integration_outbox_unpublished', ['published_at', 'occurred_at'])
@Index('idx_integration_outbox_topic_unpublished', ['kafka_topic', 'published_at', 'occurred_at'])
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

  @Column({ type: 'int', default: 1 })
  schema_version!: number;

  @Column({ type: 'varchar', length: 191, nullable: true })
  correlation_id!: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  causation_id!: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  partition_key!: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  kafka_topic!: string | null;

  @Column({ type: 'int', nullable: true })
  kafka_partition!: number | null;

  @Column({ type: 'bigint', nullable: true })
  kafka_offset!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  kafka_published_at!: Date | null;

  @Column({ type: 'int', default: 0 })
  publish_attempts!: number;

  @Column({ type: 'text', nullable: true })
  last_publish_error!: string | null;
}
