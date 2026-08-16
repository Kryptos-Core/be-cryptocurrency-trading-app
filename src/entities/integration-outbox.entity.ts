import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('integration_outbox')
@Index('idx_integration_outbox_unpublished', ['published_at', 'occurred_at'])
@Index('idx_integration_outbox_topic_unpublished', ['kafka_topic', 'published_at', 'occurred_at'])
@Index('idx_integration_outbox_retry', ['published_at', 'dead_lettered_at', 'next_retry_at'])
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

  @CreateDateColumn({ type: 'timestamp', precision: 6, name: 'occurred_at' })
  occurred_at!: Date;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
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

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  kafka_published_at!: Date | null;

  @Column({ type: 'int', default: 0 })
  publish_attempts!: number;

  @Column({ type: 'text', nullable: true })
  last_publish_error!: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  next_retry_at!: Date | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  dead_lettered_at!: Date | null;

  /**
   * Counts how many times a row has been reset from the dead-letter state back
   * into the normal relay queue. Combined with `EVENT_OUTBOX_DLQ_MAX_RETRIES`,
   * this enforces a bounded DLQ retry loop — once the counter exceeds the cap,
   * the row stays in dead-letter state and is excluded from auto-retry so a
   * poisoned message cannot churn the relay forever.
   */
  @Column({ type: 'int', default: 0 })
  dlq_retry_count!: number;
}
