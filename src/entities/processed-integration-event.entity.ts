import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('processed_integration_events')
@Index('idx_processed_integration_events_consumer_event', ['consumer_name', 'event_id'], {
  unique: true,
})
export class ProcessedIntegrationEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  consumer_name!: string;

  @Column({ type: 'char', length: 36 })
  event_id!: string;

  @Column({ type: 'varchar', length: 128 })
  event_type!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  processed_at!: Date;
}
